/**
 * Cron Management Utilities
 *
 * Provides functions to manage crontab entries for Sanj automation.
 * Handles installation, removal, and validation of cron jobs.
 *
 * Platform Support:
 * - macOS
 * - Linux
 * - Other Unix-like systems with crontab support
 *
 * @module utils/cron
 */

import { execSync, spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { SANJ_HOME } from '../storage/paths';

// =============================================================================
// Constants
// =============================================================================

/** Marker comment to identify Sanj cron entries */
export const SANJ_CRON_MARKER = '# sanj:';

/** Default cron schedule (daily at 8:00 PM) */
export const DEFAULT_CRON_SCHEDULE = '0 20 * * *';

// =============================================================================
// Types
// =============================================================================

export interface CronEntry {
  schedule: string;
  command: string;
  description: string;
}

export interface CronInstallOptions {
  /** Cron schedule expression (e.g., "0 20 * * *") */
  schedule?: string;
  /** Force reinstallation even if entry exists */
  force?: boolean;
}

export interface CronInstallResult {
  success: boolean;
  message: string;
  entry?: CronEntry;
}

export interface CronUninstallResult {
  success: boolean;
  message: string;
  removedCount: number;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validates a cron schedule expression.
 * Basic validation for common cron expressions.
 */
export function isValidCronExpression(expr: string): boolean {
  // Basic cron expression validation
  // Format: minute hour day-of-month month day-of-week
  const parts = expr.trim().split(/\s+/);

  if (parts.length !== 5) {
    return false;
  }

  // Validate each part
  const validators = [
    (val: string) => validateCronField(val, 0, 59),  // minute
    (val: string) => validateCronField(val, 0, 23),  // hour
    (val: string) => validateCronField(val, 1, 31),  // day of month
    (val: string) => validateCronField(val, 1, 12),  // month
    (val: string) => validateCronField(val, 0, 7),   // day of week (0=Sunday, 7=Sunday)
  ];

  return parts.every((part, i) => validators[i](part));
}

/**
 * Validates a single cron field.
 */
function validateCronField(field: string, min: number, max: number): boolean {
  // Allow wildcards
  if (field === '*') return true;

  // Allow step values (e.g., */5)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0;
  }

  // Allow ranges (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(v => parseInt(v, 10));
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end;
  }

  // Allow lists (e.g., 1,3,5)
  if (field.includes(',')) {
    return field.split(',').every(v => {
      const num = parseInt(v, 10);
      return !isNaN(num) && num >= min && num <= max;
    });
  }

  // Single number
  const num = parseInt(field, 10);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Converts a cron expression to human-readable format.
 */
export function cronToHumanReadable(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Special cases
  if (expr === '0 20 * * *') return 'Daily at 8:00 PM';
  if (expr === '0 8 * * *') return 'Daily at 8:00 AM';
  if (expr === '0 12 * * *') return 'Daily at 12:00 PM';
  if (expr === '0 0 * * *') return 'Daily at midnight';
  if (expr === '0 10 * * 0') return 'Weekly on Sunday at 10:00 AM';
  if (expr === '0 8 * * 1-5') return 'Weekdays at 8:00 AM';

  // Hourly patterns
  if (minute === '0' && hour === '*') return 'Every hour';
  if (minute.startsWith('*/')) {
    const interval = minute.slice(2);
    return `Every ${interval} minutes`;
  }
  if (hour.startsWith('*/')) {
    const interval = hour.slice(2);
    return `Every ${interval} hours`;
  }

  // Default: show the raw expression
  return `At ${hour}:${minute.padStart(2, '0')}`;
}

// =============================================================================
// Crontab Reading
// =============================================================================

/**
 * Reads the current user's crontab.
 * Returns null if no crontab exists.
 */
export function readCrontab(): string | null {
  try {
    const result = execSync('crontab -l', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim();
  } catch (error: any) {
    // Exit code 1 with "no crontab" message is expected when no crontab exists
    if (error.status === 1 && error.stderr && error.stderr.includes('no crontab')) {
      return null;
    }
    throw new Error(`Failed to read crontab: ${error.message}`);
  }
}

/**
 * Finds all Sanj entries in the crontab.
 */
export function findSanjEntries(crontab: string | null): CronEntry[] {
  if (!crontab) return [];

  const lines = crontab.split('\n');
  const entries: CronEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for Sanj marker comment
    if (line.startsWith(SANJ_CRON_MARKER)) {
      const description = line.slice(SANJ_CRON_MARKER.length).trim();

      // Next line should be the actual cron entry
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const parts = nextLine.split(/\s+/);
          if (parts.length >= 6) {
            const schedule = parts.slice(0, 5).join(' ');
            const command = parts.slice(5).join(' ');
            entries.push({ schedule, command, description });
          }
        }
      }
    }
  }

  return entries;
}

/**
 * Checks if Sanj cron entries already exist.
 */
export function hasSanjEntries(): boolean {
  const crontab = readCrontab();
  return findSanjEntries(crontab).length > 0;
}

// =============================================================================
// Crontab Writing
// =============================================================================

/**
 * Writes a new crontab by installing it from a temporary file.
 */
function writeCrontab(content: string): void {
  const tempFile = join(SANJ_HOME, 'temp-crontab');

  try {
    // Ensure SANJ_HOME exists
    if (!existsSync(SANJ_HOME)) {
      execSync(`mkdir -p "${SANJ_HOME}"`, { encoding: 'utf-8' });
    }

    // Write to temp file
    writeFileSync(tempFile, content, 'utf-8');

    // Install the crontab
    const result = spawnSync('crontab', [tempFile], { encoding: 'utf-8' });

    if (result.error) {
      throw new Error(`Failed to install crontab: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const errorMsg = result.stderr || result.stdout || 'Unknown error';
      throw new Error(`Failed to install crontab: ${errorMsg}`);
    }
  } finally {
    // Clean up temp file
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
}

// =============================================================================
// Cron Installation
// =============================================================================

/**
 * Installs a Sanj cron entry for automated analysis.
 */
export function installCronEntry(options: CronInstallOptions = {}): CronInstallResult {
  const schedule = options.schedule || DEFAULT_CRON_SCHEDULE;

  // Validate schedule
  if (!isValidCronExpression(schedule)) {
    return {
      success: false,
      message: `Invalid cron expression: ${schedule}`,
    };
  }

  // Check if sanj is in PATH
  let sanjPath: string;
  try {
    sanjPath = execSync('which sanj', { encoding: 'utf-8' }).trim();
  } catch (error) {
    return {
      success: false,
      message: 'sanj command not found in PATH. Please ensure sanj is installed and accessible.',
    };
  }

  // Check for existing entries
  if (!options.force && hasSanjEntries()) {
    return {
      success: false,
      message: 'Sanj cron entries already exist. Use --force to reinstall.',
    };
  }

  // Read current crontab
  const currentCrontab = readCrontab() || '';

  // Remove any existing Sanj entries if force is enabled
  let cleanedCrontab = currentCrontab;
  if (options.force) {
    const lines = currentCrontab.split('\n');
    const filteredLines: string[] = [];
    let skipNext = false;

    for (const line of lines) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      if (line.trim().startsWith(SANJ_CRON_MARKER)) {
        skipNext = true;
        continue;
      }

      filteredLines.push(line);
    }

    cleanedCrontab = filteredLines.join('\n').trim();
  }

  // Ensure log directory exists
  const logDir = join(SANJ_HOME, 'logs');
  if (!existsSync(logDir)) {
    execSync(`mkdir -p "${logDir}"`, { encoding: 'utf-8' });
  }

  // Build the new cron entry
  const logPath = join(logDir, 'analysis.log');
  const description = 'automated session analysis';
  const command = `${sanjPath} analyze >> "${logPath}" 2>&1`;

  const cronEntry = `${SANJ_CRON_MARKER} ${description}\n${schedule} ${command}`;

  // Combine with existing crontab
  const newCrontab = cleanedCrontab
    ? `${cleanedCrontab}\n\n${cronEntry}\n`
    : `${cronEntry}\n`;

  // Install the new crontab
  try {
    writeCrontab(newCrontab);

    return {
      success: true,
      message: `Cron entry installed successfully.\nSchedule: ${cronToHumanReadable(schedule)}\nLogs: ${logPath}`,
      entry: { schedule, command, description },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to install cron entry: ${error.message}`,
    };
  }
}

// =============================================================================
// Cron Uninstallation
// =============================================================================

/**
 * Removes all Sanj cron entries from the crontab.
 */
export function uninstallCronEntries(): CronUninstallResult {
  // Read current crontab
  const currentCrontab = readCrontab();

  if (!currentCrontab) {
    return {
      success: true,
      message: 'No crontab found. Sanj automation is not scheduled.',
      removedCount: 0,
    };
  }

  // Find Sanj entries
  const sanjEntries = findSanjEntries(currentCrontab);

  if (sanjEntries.length === 0) {
    return {
      success: true,
      message: 'No Sanj cron entries found.',
      removedCount: 0,
    };
  }

  // Remove Sanj entries
  const lines = currentCrontab.split('\n');
  const filteredLines: string[] = [];
  let skipNext = false;

  for (const line of lines) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (line.trim().startsWith(SANJ_CRON_MARKER)) {
      skipNext = true;
      continue;
    }

    filteredLines.push(line);
  }

  // Build new crontab
  const newCrontab = filteredLines.filter(line => line.trim()).join('\n');

  // Install the new crontab (or remove entirely if empty)
  try {
    if (newCrontab.trim()) {
      writeCrontab(newCrontab + '\n');
    } else {
      // Remove crontab entirely if it's now empty
      execSync('crontab -r', { encoding: 'utf-8' });
    }

    return {
      success: true,
      message: `Successfully removed ${sanjEntries.length} cron ${sanjEntries.length === 1 ? 'entry' : 'entries'}.\nSanj automation is now disabled.`,
      removedCount: sanjEntries.length,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to remove cron entries: ${error.message}`,
      removedCount: 0,
    };
  }
}

// =============================================================================
// Cron Status
// =============================================================================

/**
 * Gets the current status of Sanj cron entries.
 */
export function getCronStatus(): { installed: boolean; entries: CronEntry[] } {
  const crontab = readCrontab();
  const entries = findSanjEntries(crontab);

  return {
    installed: entries.length > 0,
    entries,
  };
}
