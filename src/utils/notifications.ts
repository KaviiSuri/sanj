/**
 * Desktop Notification Utility
 *
 * Provides cross-platform desktop notifications for analysis events.
 * Supports macOS (osascript) and Linux (libnotify).
 *
 * Features:
 * - Platform detection and appropriate notification method selection
 * - Configurable notification preferences
 * - Graceful fallback if notifications unavailable
 * - Non-blocking execution
 *
 * @module utils/notifications
 */

import { execSync, spawn } from 'child_process';
import { platform } from 'os';

// =============================================================================
// Types
// =============================================================================

/**
 * Notification configuration options.
 */
export interface NotificationConfig {
  /** Whether notifications are enabled */
  enabled: boolean;

  /** Minimum observation count to trigger notification */
  minObservationsCreated?: number;

  /** Notify on analysis errors */
  notifyOnError?: boolean;
}

/**
 * Notification message data.
 */
export interface NotificationMessage {
  /** Notification title */
  title: string;

  /** Notification body/message */
  message: string;

  /** Notification type (info, success, warning, error) */
  type?: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Platform type for notification system.
 */
export type Platform = 'darwin' | 'linux' | 'win32' | 'unknown';

// =============================================================================
// Platform Detection
// =============================================================================

/**
 * Get current platform for notification system.
 *
 * @returns Platform identifier
 */
export function getPlatform(): Platform {
  const os = platform();
  if (os === 'darwin' || os === 'linux' || os === 'win32') {
    return os;
  }
  return 'unknown';
}

/**
 * Check if notifications are supported on current platform.
 *
 * @returns True if notifications are supported
 */
export function isNotificationSupported(): boolean {
  const currentPlatform = getPlatform();
  return currentPlatform === 'darwin' || currentPlatform === 'linux';
}

// =============================================================================
// Platform-Specific Notification Functions
// =============================================================================

/**
 * Send notification on macOS using osascript.
 *
 * @param notification - Notification message
 * @returns True if notification sent successfully
 */
function notifyMacOS(notification: NotificationMessage): boolean {
  try {
    const { title, message } = notification;

    // Escape quotes in title and message
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedMessage = message.replace(/"/g, '\\"');

    // Build AppleScript command
    const script = `display notification "${escapedMessage}" with title "${escapedTitle}"`;

    // Execute osascript
    execSync(`osascript -e '${script}'`, {
      timeout: 5000, // 5 second timeout
      stdio: 'ignore', // Don't capture output
    });

    return true;
  } catch (error) {
    // Silently fail - notifications are best-effort
    return false;
  }
}

/**
 * Send notification on Linux using notify-send (libnotify).
 *
 * @param notification - Notification message
 * @returns True if notification sent successfully
 */
function notifyLinux(notification: NotificationMessage): boolean {
  try {
    const { title, message, type = 'info' } = notification;

    // Map notification type to urgency level
    const urgency = type === 'error' ? 'critical' : type === 'warning' ? 'normal' : 'low';

    // Check if notify-send is available
    try {
      execSync('which notify-send', { stdio: 'ignore' });
    } catch {
      // notify-send not found, fail silently
      return false;
    }

    // Execute notify-send with spawn to avoid blocking
    const child = spawn('notify-send', [
      '--urgency', urgency,
      '--app-name', 'Sanj',
      title,
      message,
    ], {
      stdio: 'ignore',
      detached: true,
    });

    // Detach from parent process
    child.unref();

    return true;
  } catch (error) {
    // Silently fail - notifications are best-effort
    return false;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Send desktop notification.
 *
 * Automatically detects platform and uses appropriate notification method.
 * Returns false if notifications are not supported or failed.
 *
 * @param notification - Notification message
 * @returns True if notification sent successfully
 *
 * @example
 * sendNotification({
 *   title: 'Sanj Analysis Complete',
 *   message: '5 new observations created',
 *   type: 'success'
 * });
 */
export function sendNotification(notification: NotificationMessage): boolean {
  const currentPlatform = getPlatform();

  switch (currentPlatform) {
    case 'darwin':
      return notifyMacOS(notification);
    case 'linux':
      return notifyLinux(notification);
    default:
      // Platform not supported
      return false;
  }
}

/**
 * Notify about successful analysis completion.
 *
 * @param stats - Analysis statistics
 * @param config - Notification configuration
 * @returns True if notification sent
 */
export function notifyAnalysisComplete(
  stats: {
    observationsCreated: number;
    observationsBumped: number;
    sessionsProcessed: number;
  },
  config: NotificationConfig
): boolean {
  // Check if notifications enabled
  if (!config.enabled) {
    return false;
  }

  // Check minimum threshold
  if (config.minObservationsCreated && stats.observationsCreated < config.minObservationsCreated) {
    return false;
  }

  // Build notification message
  const title = 'Sanj Analysis Complete';
  const message = stats.observationsCreated > 0
    ? `${stats.observationsCreated} new, ${stats.observationsBumped} updated from ${stats.sessionsProcessed} sessions`
    : `No new observations from ${stats.sessionsProcessed} sessions`;

  return sendNotification({
    title,
    message,
    type: stats.observationsCreated > 0 ? 'success' : 'info',
  });
}

/**
 * Notify about analysis error.
 *
 * @param error - Error message
 * @param config - Notification configuration
 * @returns True if notification sent
 */
export function notifyAnalysisError(
  error: string,
  config: NotificationConfig
): boolean {
  // Check if notifications enabled
  if (!config.enabled) {
    return false;
  }

  // Check if error notifications enabled
  if (!config.notifyOnError) {
    return false;
  }

  return sendNotification({
    title: 'Sanj Analysis Failed',
    message: error,
    type: 'error',
  });
}

/**
 * Get default notification configuration.
 *
 * @returns Default notification config
 */
export function getDefaultNotificationConfig(): NotificationConfig {
  return {
    enabled: false, // Disabled by default
    minObservationsCreated: 1, // Notify if at least 1 new observation
    notifyOnError: true, // Notify on errors
  };
}
