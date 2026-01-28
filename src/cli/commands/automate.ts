/**
 * Automate Command
 *
 * Provides subcommands to enable/disable scheduled automation of Sanj analysis.
 * Uses system crontab to schedule regular analysis runs.
 *
 * Commands:
 * - sanj automate enable  - Install cron job for automated analysis
 * - sanj automate disable - Remove cron job entries
 * - sanj automate status  - Show current automation status
 *
 * @module cli/commands/automate
 */

import type { Clerc } from 'clerc';
import chalk from 'chalk';
import {
  installCronEntry,
  uninstallCronEntries,
  getCronStatus,
  cronToHumanReadable,
  DEFAULT_CRON_SCHEDULE,
  isValidCronExpression,
  type CronInstallOptions,
} from '../../utils/cron';

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Main automate command handler that routes to subcommands.
 */
export async function handleAutomate(ctx: Clerc.Context): Promise<void> {
  // Get arguments from process.argv
  const argv = process.argv;
  const automateIndex = argv.indexOf("automate");
  const args = automateIndex >= 0 ? argv.slice(automateIndex + 1) : [];
  const subcommand = args[0];

  // Parse flags
  const flags = {
    schedule: args.find((arg, i) => args[i - 1] === '--schedule'),
    force: args.includes('--force'),
  };

  // Default to "status" if no subcommand specified
  if (!subcommand || subcommand === "status") {
    handleAutomateStatus();
    return;
  }

  if (subcommand === "enable") {
    await handleAutomateEnable(flags);
    return;
  }

  if (subcommand === "disable") {
    await handleAutomateDisable({ force: flags.force });
    return;
  }

  console.error(chalk.red(`✗ Unknown subcommand '${subcommand}'`));
  console.error('Valid subcommands: enable, disable, status');
  console.error('\nUsage:');
  console.error('  sanj automate [status]           - Show automation status');
  console.error('  sanj automate enable [--schedule <expr>] [--force]  - Enable automation');
  console.error('  sanj automate disable [--force]  - Disable automation');
  process.exit(1);
}

// =============================================================================
// Enable Command
// =============================================================================

/**
 * Handles the `sanj automate enable` command.
 * Installs a cron entry to run analysis automatically.
 */
async function handleAutomateEnable(flags: {
  schedule?: string;
  force?: boolean;
}): Promise<void> {
  console.log(chalk.blue('Setting up automated analysis...\n'));

  const schedule = flags.schedule || DEFAULT_CRON_SCHEDULE;

  // Validate schedule if provided
  if (flags.schedule && !isValidCronExpression(flags.schedule)) {
    console.error(chalk.red(`✗ Invalid cron expression: ${flags.schedule}`));
    console.log(chalk.dim('\nExamples of valid expressions:'));
    console.log(chalk.dim('  0 20 * * *     Daily at 8:00 PM'));
    console.log(chalk.dim('  0 */6 * * *    Every 6 hours'));
    console.log(chalk.dim('  0 8 * * 1-5    Weekdays at 8:00 AM'));
    process.exit(1);
  }

  // Show what will be installed
  console.log(chalk.dim('Schedule:') + ' ' + cronToHumanReadable(schedule));
  console.log(chalk.dim('Cron expression:') + ' ' + schedule);
  console.log(chalk.dim('Command:') + ' sanj analyze\n');

  // Prompt for confirmation unless force is enabled
  if (!flags.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow('Install cron entry? [y/N] '), (ans) => {
        rl.close();
        resolve(ans);
      });
    });

    if (!answer.toLowerCase().startsWith('y')) {
      console.log(chalk.dim('Cancelled.'));
      process.exit(0);
    }
  }

  // Install the cron entry
  const options: CronInstallOptions = {
    schedule: flags.schedule,
    force: flags.force,
  };

  const result = installCronEntry(options);

  if (result.success) {
    console.log(chalk.green('\n✓ ' + result.message.split('\n')[0]));
    const lines = result.message.split('\n').slice(1);
    lines.forEach(line => console.log(chalk.dim(line)));

    console.log(chalk.dim('\nTip: Check automation status with:'));
    console.log(chalk.dim('  sanj automate status'));
  } else {
    console.error(chalk.red('\n✗ ' + result.message));
    process.exit(1);
  }
}

// =============================================================================
// Disable Command
// =============================================================================

/**
 * Handles the `sanj automate disable` command.
 * Removes all Sanj cron entries.
 */
async function handleAutomateDisable(flags: {
  force?: boolean;
}): Promise<void> {
  console.log(chalk.blue('Disabling automated analysis...\n'));

  // Check current status
  const status = getCronStatus();

  if (!status.installed) {
    console.log(chalk.dim('No automation is currently scheduled.'));
    process.exit(0);
  }

  // Show what will be removed
  console.log(chalk.dim('Found ' + status.entries.length + ' cron ' +
    (status.entries.length === 1 ? 'entry' : 'entries') + ' to remove:'));
  status.entries.forEach(entry => {
    console.log(chalk.dim('  - ' + entry.description + ': ' + cronToHumanReadable(entry.schedule)));
  });
  console.log();

  // Prompt for confirmation unless force is enabled
  if (!flags.force) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow('Remove cron entries? [y/N] '), (ans) => {
        rl.close();
        resolve(ans);
      });
    });

    if (!answer.toLowerCase().startsWith('y')) {
      console.log(chalk.dim('Cancelled.'));
      process.exit(0);
    }
  }

  // Remove the cron entries
  const result = uninstallCronEntries();

  if (result.success) {
    console.log(chalk.green('\n✓ ' + result.message.split('\n')[0]));
    const lines = result.message.split('\n').slice(1);
    lines.forEach(line => console.log(chalk.dim(line)));
  } else {
    console.error(chalk.red('\n✗ ' + result.message));
    process.exit(1);
  }
}

// =============================================================================
// Status Command
// =============================================================================

/**
 * Handles the `sanj automate status` command.
 * Shows current automation status.
 */
function handleAutomateStatus(): void {
  const status = getCronStatus();

  console.log(chalk.bold('\nAutomation Status\n'));

  if (!status.installed) {
    console.log(chalk.dim('Status:') + ' ' + chalk.yellow('Not configured'));
    console.log(chalk.dim('\nAutomated analysis is not currently scheduled.'));
    console.log(chalk.dim('To enable automation, run:'));
    console.log(chalk.dim('  sanj automate enable'));
  } else {
    console.log(chalk.dim('Status:') + ' ' + chalk.green('Enabled'));
    console.log(chalk.dim('\nScheduled tasks:'));

    status.entries.forEach(entry => {
      console.log(chalk.dim('  • ') + entry.description);
      console.log(chalk.dim('    Schedule: ') + cronToHumanReadable(entry.schedule) +
        chalk.dim(' (' + entry.schedule + ')'));
      console.log(chalk.dim('    Command:  ') + entry.command);
    });

    console.log(chalk.dim('\nTo disable automation, run:'));
    console.log(chalk.dim('  sanj automate disable'));
  }

  console.log();
}

