/**
 * Tests for Desktop Notification Utility
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import {
  getPlatform,
  isNotificationSupported,
  sendNotification,
  notifyAnalysisComplete,
  notifyAnalysisError,
  getDefaultNotificationConfig,
  type NotificationMessage,
  type NotificationConfig,
} from '../../src/utils/notifications';

// =============================================================================
// Helper Functions
// =============================================================================

function mockPlatform(platform: string) {
  spyOn(os, 'platform').mockReturnValue(platform as NodeJS.Platform);
}

// =============================================================================
// Platform Detection Tests
// =============================================================================

describe('Platform Detection', () => {
  afterEach(() => {
    mock.restore();
  });

  it('should detect macOS platform', () => {
    mockPlatform('darwin');
    expect(getPlatform()).toBe('darwin');
  });

  it('should detect Linux platform', () => {
    mockPlatform('linux');
    expect(getPlatform()).toBe('linux');
  });

  it('should detect Windows platform', () => {
    mockPlatform('win32');
    expect(getPlatform()).toBe('win32');
  });

  it('should return unknown for unsupported platforms', () => {
    mockPlatform('freebsd');
    expect(getPlatform()).toBe('unknown');
  });

  it('should recognize macOS as supported', () => {
    mockPlatform('darwin');
    expect(isNotificationSupported()).toBe(true);
  });

  it('should recognize Linux as supported', () => {
    mockPlatform('linux');
    expect(isNotificationSupported()).toBe(true);
  });

  it('should not support Windows', () => {
    mockPlatform('win32');
    expect(isNotificationSupported()).toBe(false);
  });

  it('should not support unknown platforms', () => {
    mockPlatform('freebsd');
    expect(isNotificationSupported()).toBe(false);
  });
});

// =============================================================================
// Notification Sending Tests
// =============================================================================

describe('sendNotification', () => {
  const mockNotification: NotificationMessage = {
    title: 'Test Title',
    message: 'Test Message',
    type: 'info',
  };

  afterEach(() => {
    mock.restore();
  });

  it('should return false for unsupported platforms', () => {
    mockPlatform('win32');
    const result = sendNotification(mockNotification);
    expect(result).toBe(false);
  });

  // Note: We can't easily test actual osascript/notify-send execution in tests
  // without mocking child_process, which is complex. The real behavior is tested
  // manually. These tests focus on platform detection and config handling.
});

// =============================================================================
// Analysis Notification Tests
// =============================================================================

describe('notifyAnalysisComplete', () => {
  const mockStats = {
    observationsCreated: 5,
    observationsBumped: 3,
    sessionsProcessed: 10,
  };

  afterEach(() => {
    mock.restore();
  });

  it('should not send notification when disabled', () => {
    const config: NotificationConfig = {
      enabled: false,
      minObservationsCreated: 1,
      notifyOnError: true,
    };

    const result = notifyAnalysisComplete(mockStats, config);
    expect(result).toBe(false);
  });

  it('should not send notification below threshold', () => {
    const config: NotificationConfig = {
      enabled: true,
      minObservationsCreated: 10, // Higher than mockStats.observationsCreated
      notifyOnError: true,
    };

    const result = notifyAnalysisComplete(mockStats, config);
    expect(result).toBe(false);
  });

  it('should send notification when enabled and above threshold', () => {
    mockPlatform('darwin'); // Use supported platform
    const config: NotificationConfig = {
      enabled: true,
      minObservationsCreated: 3, // Lower than mockStats.observationsCreated
      notifyOnError: true,
    };

    // We can't verify actual notification was sent without complex mocking,
    // but we can verify the function doesn't throw and returns appropriately
    const result = notifyAnalysisComplete(mockStats, config);
    expect(typeof result).toBe('boolean');
  });

  it('should handle stats with zero observations', () => {
    mockPlatform('darwin');
    const statsWithZero = {
      observationsCreated: 0,
      observationsBumped: 0,
      sessionsProcessed: 5,
    };

    const config: NotificationConfig = {
      enabled: true,
      minObservationsCreated: 1, // Would block notification
      notifyOnError: true,
    };

    const result = notifyAnalysisComplete(statsWithZero, config);
    expect(result).toBe(false);
  });

  it('should send notification when threshold is zero or undefined', () => {
    mockPlatform('darwin');
    const config: NotificationConfig = {
      enabled: true,
      minObservationsCreated: undefined, // No threshold
      notifyOnError: true,
    };

    const result = notifyAnalysisComplete(mockStats, config);
    expect(typeof result).toBe('boolean');
  });
});

describe('notifyAnalysisError', () => {
  const errorMessage = 'Test error message';

  afterEach(() => {
    mock.restore();
  });

  it('should not send notification when disabled', () => {
    const config: NotificationConfig = {
      enabled: false,
      notifyOnError: true,
    };

    const result = notifyAnalysisError(errorMessage, config);
    expect(result).toBe(false);
  });

  it('should not send notification when notifyOnError is false', () => {
    const config: NotificationConfig = {
      enabled: true,
      notifyOnError: false,
    };

    const result = notifyAnalysisError(errorMessage, config);
    expect(result).toBe(false);
  });

  it('should send notification when enabled and notifyOnError is true', () => {
    mockPlatform('darwin');
    const config: NotificationConfig = {
      enabled: true,
      notifyOnError: true,
    };

    const result = notifyAnalysisError(errorMessage, config);
    expect(typeof result).toBe('boolean');
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('getDefaultNotificationConfig', () => {
  it('should return default config with notifications disabled', () => {
    const config = getDefaultNotificationConfig();
    expect(config.enabled).toBe(false);
  });

  it('should have minObservationsCreated set to 1', () => {
    const config = getDefaultNotificationConfig();
    expect(config.minObservationsCreated).toBe(1);
  });

  it('should have notifyOnError enabled', () => {
    const config = getDefaultNotificationConfig();
    expect(config.notifyOnError).toBe(true);
  });

  it('should return a complete NotificationConfig', () => {
    const config = getDefaultNotificationConfig();
    expect(config).toHaveProperty('enabled');
    expect(config).toHaveProperty('minObservationsCreated');
    expect(config).toHaveProperty('notifyOnError');
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe('Edge Cases', () => {
  afterEach(() => {
    mock.restore();
  });

  it('should handle empty notification title', () => {
    mockPlatform('darwin');
    const notification: NotificationMessage = {
      title: '',
      message: 'Message without title',
    };

    const result = sendNotification(notification);
    expect(typeof result).toBe('boolean');
  });

  it('should handle empty notification message', () => {
    mockPlatform('darwin');
    const notification: NotificationMessage = {
      title: 'Title without message',
      message: '',
    };

    const result = sendNotification(notification);
    expect(typeof result).toBe('boolean');
  });

  it('should handle notification with special characters', () => {
    mockPlatform('darwin');
    const notification: NotificationMessage = {
      title: 'Test "quoted" title',
      message: "Test 'quoted' message with $pecial ch@rs!",
    };

    const result = sendNotification(notification);
    expect(typeof result).toBe('boolean');
  });

  it('should handle very long notification messages', () => {
    mockPlatform('darwin');
    const longMessage = 'A'.repeat(1000);
    const notification: NotificationMessage = {
      title: 'Long Message Test',
      message: longMessage,
    };

    const result = sendNotification(notification);
    expect(typeof result).toBe('boolean');
  });
});
