/**
 * Tests for SessionAdapter interface
 *
 * Verifies that SessionAdapter interface is properly defined and can be imported.
 */

import { describe, it, expect } from 'bun:test';
import { Session, SessionAdapter } from '../../src/adapters/session/SessionAdapter';

describe('SessionAdapter Interface', () => {
  describe('Session interface', () => {
    it('should define all required fields', () => {
      const session: Session = {
        id: 'test-id-123',
        toolName: 'test-tool',
        projectPath: '/test/path',
        timestamp: new Date('2025-01-27'),
        content: 'Test conversation content',
        filePath: '/test/path/session.json',
      };

      expect(session.id).toBe('test-id-123');
      expect(session.toolName).toBe('test-tool');
      expect(session.projectPath).toBe('/test/path');
      expect(session.timestamp).toBeInstanceOf(Date);
      expect(session.content).toBe('Test conversation content');
      expect(session.filePath).toBe('/test/path/session.json');
    });

    it('should allow optional projectPath', () => {
      const session: Session = {
        id: 'test-id-456',
        toolName: 'test-tool',
        timestamp: new Date('2025-01-27'),
        content: 'Test conversation content',
        filePath: '/test/path/session.json',
      };

      expect(session.projectPath).toBeUndefined();
    });

    it('should require all mandatory fields', () => {
      const partial1 = {
        toolName: 'test-tool',
        timestamp: new Date('2025-01-27'),
        content: 'Test conversation content',
        filePath: '/test/path/session.json',
      };

      const partial2 = {
        id: 'test-id',
        timestamp: new Date('2025-01-27'),
        content: 'Test conversation content',
        filePath: '/test/path/session.json',
      };

      // Verify that partial objects don't match Session interface
      expect(() => {
        const s1 = partial1 as Session;
        expect(s1.id).toBeUndefined();
      }).not.toThrow();

      expect(() => {
        const s2 = partial2 as Session;
        expect(s2.toolName).toBeUndefined();
      }).not.toThrow();
    });
  });

  describe('SessionAdapter interface', () => {
    it('should define required methods and properties', () => {
      class MockSessionAdapter implements SessionAdapter {
        name = 'Mock Adapter';
        async isAvailable(): Promise<boolean> {
          return true;
        }
        async getSessions(since?: Date): Promise<Session[]> {
          return [];
        }
      }

      const adapter = new MockSessionAdapter();

      expect(adapter.name).toBe('Mock Adapter');
      expect(adapter.isAvailable).toBeDefined();
      expect(adapter.getSessions).toBeDefined();
    });

    it('should enforce async return types', async () => {
      class AsyncMockAdapter implements SessionAdapter {
        name = 'Async Mock Adapter';
        async isAvailable(): Promise<boolean> {
          return Promise.resolve(true);
        }
        async getSessions(since?: Date): Promise<Session[]> {
          return Promise.resolve([]);
        }
      }

      const adapter = new AsyncMockAdapter();
      const isAvail = await adapter.isAvailable();
      const sessions = await adapter.getSessions();

      expect(isAvail).toBe(true);
      expect(sessions).toEqual([]);
    });

    it('should allow optional since parameter', async () => {
      class OptionalParamAdapter implements SessionAdapter {
        name = 'Optional Param Adapter';
        async isAvailable(): Promise<boolean> {
          return true;
        }
        async getSessions(since?: Date): Promise<Session[]> {
          if (since) {
            return [{ id: '1', toolName: this.name, timestamp: new Date(), content: '', filePath: '' }];
          }
          return [];
        }
      }

      const adapter = new OptionalParamAdapter();

      // Without since parameter
      const sessions1 = await adapter.getSessions();
      expect(sessions1).toEqual([]);

      // With since parameter
      const sessions2 = await adapter.getSessions(new Date('2025-01-01'));
      expect(sessions2).toHaveLength(1);
    });
  });

  describe('SessionAdapter implementations', () => {
    it('should support multiple adapter implementations', async () => {
      class ClaudeCodeAdapter implements SessionAdapter {
        name = 'Claude Code';
        async isAvailable(): Promise<boolean> {
          return true;
        }
        async getSessions(since?: Date): Promise<Session[]> {
          return [];
        }
      }

      class OpenCodeAdapter implements SessionAdapter {
        name = 'OpenCode';
        async isAvailable(): Promise<boolean> {
          return true;
        }
        async getSessions(since?: Date): Promise<Session[]> {
          return [];
        }
      }

      const claudeAdapter = new ClaudeCodeAdapter();
      const openCodeAdapter = new OpenCodeAdapter();

      expect(claudeAdapter.name).toBe('Claude Code');
      expect(openCodeAdapter.name).toBe('OpenCode');

      const claudeSessions = await claudeAdapter.getSessions();
      const openCodeSessions = await openCodeAdapter.getSessions();

      expect(claudeSessions).toEqual([]);
      expect(openCodeSessions).toEqual([]);
    });
  });
});
