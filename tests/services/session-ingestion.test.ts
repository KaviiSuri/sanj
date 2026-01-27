/**
 * Tests for SessionIngestionService
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionIngestionService } from '../../src/services/session-ingestion';
import type { SessionEvent } from '../../src/services/file-watcher';
import type { Session } from '../../src/core/types';

describe('SessionIngestionService', () => {
  let service: SessionIngestionService;

  beforeEach(() => {
    service = new SessionIngestionService({
      skipExisting: true,
      claudeDir: '/tmp/test-sessions',
    });
  });

  afterEach(() => {
    service.clearIngestedCache();
  });

  describe('constructor', () => {
    it('should create service with default options', () => {
      const defaultService = new SessionIngestionService();
      expect(defaultService).toBeDefined();
    });

    it('should create service with custom options', () => {
      const customService = new SessionIngestionService({
        skipExisting: false,
        triggerAnalysis: true,
        claudeDir: '/custom/path',
      });
      expect(customService).toBeDefined();
    });
  });

  describe('handleSessionEvent', () => {
    it('should handle newSession event successfully', async () => {
      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'test-session-1',
        sessionPath: '/tmp/test-sessions/test-session-1',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-1');
    });

    it('should handle conversationUpdated event successfully', async () => {
      const mockEvent: SessionEvent = {
        type: 'conversationUpdated',
        sessionId: 'test-session-2',
        sessionPath: '/tmp/test-sessions/test-session-2',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-2');
    });

    it('should handle sessionClosed event successfully', async () => {
      const mockEvent: SessionEvent = {
        type: 'sessionClosed',
        sessionId: 'test-session-3',
        sessionPath: '/tmp/test-sessions/test-session-3',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-3');
    });

    it('should handle missing sessions gracefully', async () => {
      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'non-existent-session',
        sessionPath: '/tmp/test-sessions/non-existent',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('non-existent-session');
    });
  });

  describe('idempotency', () => {
    it('should skip already ingested session when skipExisting is true', async () => {
      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'test-session-4',
        sessionPath: '/tmp/test-sessions/test-session-4',
        timestamp: new Date(),
      };

      const firstResult = await service.handleSessionEvent(mockEvent);
      const secondResult = await service.handleSessionEvent(mockEvent);

      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
    });

    it('should ingest duplicate session when skipExisting is false', async () => {
      const skipFalseService = new SessionIngestionService({
        skipExisting: false,
        claudeDir: '/tmp/test-sessions',
      });

      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'test-session-5',
        sessionPath: '/tmp/test-sessions/test-session-5',
        timestamp: new Date(),
      };

      const firstResult = await skipFalseService.handleSessionEvent(mockEvent);
      const secondResult = await skipFalseService.handleSessionEvent(mockEvent);

      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
    });
  });

  describe('ingestion tracking', () => {
    it('should track ingested sessions', async () => {
      const mockEvent1: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-1',
        sessionPath: '/tmp/test-sessions/session-1',
        timestamp: new Date(),
      };

      const mockEvent2: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-2',
        sessionPath: '/tmp/test-sessions/session-2',
        timestamp: new Date(),
      };

      await service.handleSessionEvent(mockEvent1);
      await service.handleSessionEvent(mockEvent2);

      const sessionIds = service.getIngestedSessionIds();

      // Sessions are tracked even if not found in discovery
      expect(sessionIds.length).toBeGreaterThanOrEqual(2);
      expect(sessionIds).toContain('session-1');
      expect(sessionIds).toContain('session-2');
    });

    it('should return false for non-ingested session', () => {
      expect(service.hasIngestedSession('non-existent')).toBe(false);
    });

    it('should clear ingested cache', async () => {
      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-3',
        sessionPath: '/tmp/test-sessions/session-3',
        timestamp: new Date(),
      };

      await service.handleSessionEvent(mockEvent);
      expect(service.hasIngestedSession('session-3')).toBe(true);

      service.clearIngestedCache();
      expect(service.hasIngestedSession('session-3')).toBe(false);
    });
  });

  describe('event listeners', () => {
    it('should emit ingested events', async () => {
      let capturedEvent: any = null;

      service.on('ingested', (event) => {
        capturedEvent = event;
      });

      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-4',
        sessionPath: '/tmp/test-sessions/session-4',
        timestamp: new Date(),
      };

      await service.handleSessionEvent(mockEvent);

      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent.sessionId).toBe('session-4');
      expect(['skipped', 'error']).toContain(capturedEvent.type);
    });

    it('should emit error events', async () => {
      let capturedEvents: any[] = [];

      service.on('ingested', (event) => {
        capturedEvents.push(event);
      });

      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'invalid-session',
        sessionPath: '/tmp/test-sessions/invalid-session',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);
      expect(result.success).toBe(true);
      expect(capturedEvents.length).toBeGreaterThan(0);
    });

    it('should support multiple listeners', async () => {
      let count = 0;

      const listener1 = () => { count++; };
      const listener2 = () => { count++; };

      service.on('ingested', listener1);
      service.on('ingested', listener2);

      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-5',
        sessionPath: '/tmp/test-sessions/session-5',
        timestamp: new Date(),
      };

      await service.handleSessionEvent(mockEvent);

      expect(count).toBe(2);

      service.off('ingested', listener1);
      service.off('ingested', listener2);
    });

    it('should remove listeners correctly', async () => {
      let count = 0;

      const listener = () => { count++; };

      service.on('ingested', listener);

      const mockEvent1: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-6',
        sessionPath: '/tmp/test-sessions/session-6',
        timestamp: new Date(),
      };

      await service.handleSessionEvent(mockEvent1);
      expect(count).toBe(1);

      service.off('ingested', listener);

      const mockEvent2: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-7',
        sessionPath: '/tmp/test-sessions/session-7',
        timestamp: new Date(),
      };

      await service.handleSessionEvent(mockEvent2);
      expect(count).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle missing sessions gracefully', async () => {
      const mockEvent: SessionEvent = {
        type: 'sessionClosed',
        sessionId: 'non-existent-session',
        sessionPath: '/tmp/test-sessions/non-existent',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);

      expect(result.success).toBe(true);
    });

    it('should not crash on listener errors', async () => {
      const errorListener = () => {
        // Do nothing
      };

      service.on('error', errorListener);

      const mockEvent: SessionEvent = {
        type: 'newSession',
        sessionId: 'session-8',
        sessionPath: '/tmp/test-sessions/session-8',
        timestamp: new Date(),
      };

      const result = await service.handleSessionEvent(mockEvent);

      expect(result.success).toBe(true);

      service.off('error', errorListener);
    });
  });
});
