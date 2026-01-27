/**
 * Tests for session metadata extractor
 */

import { describe, it, expect } from 'bun:test';
import {
  extractSessionMetadata,
  calculateSessionDuration,
  formatDuration,
  extractWorkingDirectory,
  hasMessages,
  validateSession,
} from '../../src/parsers/session-metadata';
import type { ParsedConversation } from '../../src/parsers/conversation';
import type { Session } from '../../src/core/types';

describe('extractSessionMetadata', () => {
  it('should extract session metadata from Claude Code path with conversation sessionId', () => {
    const conversation: ParsedConversation = {
      messages: [
        { role: 'user', content: 'Hello', timestamp: new Date('2024-01-01T10:00:00Z') },
        { role: 'assistant', content: 'Hi there', timestamp: new Date('2024-01-01T10:01:00Z') },
      ],
      sessionId: 'session-abc123',
      cwd: '/home/user/project',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      modifiedAt: new Date('2024-01-01T10:01:00Z'),
    };

    const session = extractSessionMetadata({
      filePath: '/home/user/.claude/projects/my-project/conversation-xyz.jsonl',
      conversation,
    });

    expect(session.id).toBe('session-abc123'); // Uses conversation sessionId
    expect(session.tool).toBe('claude-code');
    expect(session.projectSlug).toBe('my-project');
    expect(session.createdAt).toEqual(new Date('2024-01-01T10:00:00Z'));
    expect(session.modifiedAt).toEqual(new Date('2024-01-01T10:01:00Z'));
    expect(session.path).toBe('/home/user/.claude/projects/my-project/conversation-xyz.jsonl');
    expect(session.messageCount).toBe(2);
  });

  it('should extract session ID from file path if conversation sessionId is missing', () => {
    const conversation: ParsedConversation = {
      messages: [{ role: 'user', content: 'Test' }],
      createdAt: new Date('2024-01-01T10:00:00Z'),
      modifiedAt: new Date('2024-01-01T10:01:00Z'),
    };

    const session = extractSessionMetadata({
      filePath: '/home/user/.claude/projects/my-project/session-xyz789.jsonl',
      conversation,
    });

    expect(session.id).toBe('session-xyz789');
  });

  it('should detect OpenCode tool from file path', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const session = extractSessionMetadata({
      filePath: '/home/user/.local/share/opencode/sessions/abc123.json',
      conversation,
    });

    expect(session.tool).toBe('opencode');
  });

  it('should use provided tool override', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const session = extractSessionMetadata({
      filePath: '/some/path/session.jsonl',
      conversation,
      tool: 'opencode',
    });

    expect(session.tool).toBe('opencode');
  });

  it('should handle missing project slug', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const session = extractSessionMetadata({
      filePath: '/home/user/.claude/session-123.jsonl',
      conversation,
    });

    expect(session.projectSlug).toBeUndefined();
  });

  it('should use current date if timestamps are missing', () => {
    const conversation: ParsedConversation = {
      messages: [{ role: 'user', content: 'Test' }],
    };

    const beforeExtraction = new Date();
    const session = extractSessionMetadata({
      filePath: '/home/user/.claude/session-123.jsonl',
      conversation,
    });
    const afterExtraction = new Date();

    expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(beforeExtraction.getTime());
    expect(session.createdAt.getTime()).toBeLessThanOrEqual(afterExtraction.getTime());
    expect(session.modifiedAt).toEqual(session.createdAt);
  });

  it('should handle empty message list', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date('2024-01-01T10:00:00Z'),
      modifiedAt: new Date('2024-01-01T10:00:00Z'),
    };

    const session = extractSessionMetadata({
      filePath: '/home/user/.claude/session-123.jsonl',
      conversation,
    });

    expect(session.messageCount).toBe(0);
  });

  it('should extract project slug from OpenCode path format', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const session = extractSessionMetadata({
      filePath: '/home/user/.local/share/opencode/projects/test-project/session.json',
      conversation,
    });

    expect(session.projectSlug).toBe('test-project');
  });

  it('should use file path as session ID for generic conversation.jsonl filenames', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const filePath = '/home/user/.claude/projects/my-project/conversation.jsonl';
    const session = extractSessionMetadata({
      filePath,
      conversation,
    });

    expect(session.id).toBe(filePath);
  });

  it('should handle Windows-style paths for Claude Code detection', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const session = extractSessionMetadata({
      filePath: 'C:\\Users\\John\\.claude\\projects\\my-project\\session.jsonl',
      conversation,
    });

    expect(session.tool).toBe('claude-code');
  });

  it('should handle Windows-style paths for OpenCode detection', () => {
    const conversation: ParsedConversation = {
      messages: [],
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    const session = extractSessionMetadata({
      filePath: 'C:\\Users\\John\\AppData\\Local\\opencode\\sessions\\session.json',
      conversation,
    });

    expect(session.tool).toBe('opencode');
  });
});

describe('calculateSessionDuration', () => {
  it('should calculate duration in milliseconds', () => {
    const session: Session = {
      id: 'test',
      tool: 'claude-code',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      modifiedAt: new Date('2024-01-01T11:30:00Z'),
      path: '/test/path',
      messageCount: 10,
    };

    const duration = calculateSessionDuration(session);
    expect(duration).toBe(90 * 60 * 1000); // 90 minutes in milliseconds
  });

  it('should return 0 for sessions with same start and end time', () => {
    const timestamp = new Date('2024-01-01T10:00:00Z');
    const session: Session = {
      id: 'test',
      tool: 'claude-code',
      createdAt: timestamp,
      modifiedAt: timestamp,
      path: '/test/path',
      messageCount: 1,
    };

    const duration = calculateSessionDuration(session);
    expect(duration).toBe(0);
  });
});

describe('formatDuration', () => {
  it('should format hours and minutes', () => {
    const twoHours15Minutes = 2 * 60 * 60 * 1000 + 15 * 60 * 1000;
    expect(formatDuration(twoHours15Minutes)).toBe('2h 15m');
  });

  it('should format only hours when minutes are zero', () => {
    const twoHours = 2 * 60 * 60 * 1000;
    expect(formatDuration(twoHours)).toBe('2h 0m');
  });

  it('should format only minutes for durations less than an hour', () => {
    const fortyFiveMinutes = 45 * 60 * 1000;
    expect(formatDuration(fortyFiveMinutes)).toBe('45m');
  });

  it('should format only seconds for durations less than a minute', () => {
    const thirtySeconds = 30 * 1000;
    expect(formatDuration(thirtySeconds)).toBe('30s');
  });

  it('should handle zero duration', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('should handle very long durations', () => {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    expect(formatDuration(twentyFourHours)).toBe('24h 0m');
  });
});

describe('extractWorkingDirectory', () => {
  it('should extract cwd from conversation', () => {
    const conversation: ParsedConversation = {
      messages: [],
      cwd: '/home/user/my-project',
    };

    const cwd = extractWorkingDirectory(conversation);
    expect(cwd).toBe('/home/user/my-project');
  });

  it('should return undefined if cwd is not present', () => {
    const conversation: ParsedConversation = {
      messages: [],
    };

    const cwd = extractWorkingDirectory(conversation);
    expect(cwd).toBeUndefined();
  });
});

describe('hasMessages', () => {
  it('should return true for sessions with messages', () => {
    const session: Session = {
      id: 'test',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date(),
      path: '/test/path',
      messageCount: 5,
    };

    expect(hasMessages(session)).toBe(true);
  });

  it('should return false for sessions with zero messages', () => {
    const session: Session = {
      id: 'test',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date(),
      path: '/test/path',
      messageCount: 0,
    };

    expect(hasMessages(session)).toBe(false);
  });
});

describe('validateSession', () => {
  it('should validate a complete session', () => {
    const session: Session = {
      id: 'session-123',
      tool: 'claude-code',
      projectSlug: 'my-project',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      modifiedAt: new Date('2024-01-01T11:00:00Z'),
      path: '/home/user/.claude/session-123.jsonl',
      messageCount: 10,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject session with empty ID', () => {
    const session: Session = {
      id: '',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date(),
      path: '/test/path',
      messageCount: 5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Session ID is required');
  });

  it('should reject session with empty path', () => {
    const session: Session = {
      id: 'test-123',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date(),
      path: '',
      messageCount: 5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Session path is required');
  });

  it('should reject session with invalid createdAt', () => {
    const session: Session = {
      id: 'test-123',
      tool: 'claude-code',
      createdAt: new Date('invalid'),
      modifiedAt: new Date(),
      path: '/test/path',
      messageCount: 5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Valid createdAt timestamp is required');
  });

  it('should reject session with invalid modifiedAt', () => {
    const session: Session = {
      id: 'test-123',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date('invalid'),
      path: '/test/path',
      messageCount: 5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Valid modifiedAt timestamp is required');
  });

  it('should reject session with negative message count', () => {
    const session: Session = {
      id: 'test-123',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date(),
      path: '/test/path',
      messageCount: -1,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Message count cannot be negative');
  });

  it('should reject session where modifiedAt is before createdAt', () => {
    const session: Session = {
      id: 'test-123',
      tool: 'claude-code',
      createdAt: new Date('2024-01-01T12:00:00Z'),
      modifiedAt: new Date('2024-01-01T10:00:00Z'),
      path: '/test/path',
      messageCount: 5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('modifiedAt cannot be before createdAt');
  });

  it('should report multiple errors at once', () => {
    const session: Session = {
      id: '',
      tool: 'claude-code',
      createdAt: new Date('invalid'),
      modifiedAt: new Date('invalid'),
      path: '',
      messageCount: -5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('should accept session with optional projectSlug', () => {
    const session: Session = {
      id: 'test-123',
      tool: 'claude-code',
      createdAt: new Date(),
      modifiedAt: new Date(),
      path: '/test/path',
      messageCount: 5,
    };

    const result = validateSession(session);
    expect(result.valid).toBe(true);
  });
});
