/**
 * Unit tests for FileWatcher service.
 *
 * Tests file watching functionality for Claude Code session detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, rmdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWatcher, createFileWatcher, type SessionEvent, type FileWatcherOptions } from '../../src/services/file-watcher';

describe('FileWatcher', () => {
  let tempDir: string;
  let watcher: FileWatcher;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sanj-file-watcher-test-'));
  });

  afterEach(async () => {
    if (watcher && watcher.isWatching()) {
      await watcher.stop();
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      watcher = createFileWatcher();

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should initialize with custom watchPath', () => {
      const customPath = '/custom/path';
      watcher = new FileWatcher({ watchPath: customPath });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should initialize with custom debounce delay', () => {
      const customDebounce = 2000;
      watcher = new FileWatcher({ debounceDelay: customDebounce });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should initialize with ignoreInitial option', () => {
      watcher = new FileWatcher({ ignoreInitial: true });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should initialize with custom marker file', () => {
      watcher = new FileWatcher({ markerFile: '.custom-marker' });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should initialize with custom conversation file', () => {
      watcher = new FileWatcher({ conversationFile: 'custom-conversation.jsonl' });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });
  });

  describe('start and stop', () => {
    it('should start watching a directory', async () => {
      watcher = new FileWatcher({ watchPath: tempDir });

      await watcher.start();

      expect(watcher.isWatching()).toBe(true);
    });

    it('should stop watching', async () => {
      watcher = new FileWatcher({ watchPath: tempDir });

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);

      await watcher.stop();

      expect(watcher.isWatching()).toBe(false);
    });

    it('should be idempotent for start', async () => {
      watcher = new FileWatcher({ watchPath: tempDir });

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);

      await watcher.stop();
    });

    it('should be idempotent for stop', async () => {
      watcher = new FileWatcher({ watchPath: tempDir });

      await watcher.start();
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);

      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });
  });

  describe('new session detection', () => {
    it('should emit session event when marker file is created', async () => {
      const events: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir, debounceDelay: 100 });

      watcher.on('session', (event) => {
        events.push(event);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-123');
      mkdirSync(sessionDir);
      const markerPath = join(sessionDir, '.claudesettings.local.json');
      writeFileSync(markerPath, '{}');

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(events.length).toBeGreaterThan(0);
      const newSessionEvent = events.find(e => e.type === 'newSession');
      expect(newSessionEvent).toBeDefined();
      expect(newSessionEvent?.sessionId).toBe('session-123');
      expect(newSessionEvent?.sessionPath).toBe(sessionDir);
      expect(newSessionEvent?.timestamp).toBeInstanceOf(Date);
    });

    it('should not emit event for directories without marker file', async () => {
      const events: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir, debounceDelay: 100 });

      watcher.on('session', (event) => {
        events.push(event);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'invalid-session');
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, 'other-file.txt'), 'test');

      await new Promise(resolve => setTimeout(resolve, 500));

      const newSessionEvent = events.find(e => e.type === 'newSession' && e.sessionId === 'invalid-session');
      expect(newSessionEvent).toBeUndefined();
    });

    it('should extract sessionId from path correctly', async () => {
      const events: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir, debounceDelay: 100 });

      watcher.on('session', (event) => {
        events.push(event);
      });

      await watcher.start();

      const sessionId = 'test-session-xyz';
      const sessionDir = join(tempDir, sessionId);
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, '.claudesettings.local.json'), '{}');

      await new Promise(resolve => setTimeout(resolve, 500));

      const newSessionEvent = events.find(e => e.type === 'newSession');
      expect(newSessionEvent?.sessionId).toBe(sessionId);
    });
  });

  describe('conversation update detection', () => {
    it('should emit conversationUpdated event when conversation file changes', async () => {
      const events: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('session', (event) => {
        events.push(event);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-abc');
      mkdirSync(sessionDir);
      const markerPath = join(sessionDir, '.claudesettings.local.json');
      writeFileSync(markerPath, '{}');
      const conversationPath = join(sessionDir, 'conversation.jsonl');
      writeFileSync(conversationPath, '{"role":"user","content":"test"}\n');

      await new Promise(resolve => setTimeout(resolve, 1500));
      events.length = 0;

      writeFileSync(conversationPath, '{"role":"user","content":"test"}\n{"role":"assistant","content":"response"}\n');

      await new Promise(resolve => setTimeout(resolve, 1500));

      const updateEvents = events.filter(e => e.type === 'conversationUpdated');
      expect(updateEvents.length).toBeGreaterThan(0);
      const updateEvent = updateEvents[0];
      expect(updateEvent?.sessionId).toBe('session-abc');
      expect(updateEvent?.sessionPath).toBe(sessionDir);
    });

    it('should debounce rapid writes to conversation file', async () => {
      const events: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir, debounceDelay: 100 });

      watcher.on('session', (event) => {
        events.push(event);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-debounce');
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, '.claudesettings.local.json'), '{}');
      const conversationPath = join(sessionDir, 'conversation.jsonl');
      writeFileSync(conversationPath, '{}\n');

      await new Promise(resolve => setTimeout(resolve, 1500));
      events.length = 0;

      for (let i = 0; i < 5; i++) {
        writeFileSync(conversationPath, `{"test":${i}}\n`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const updateEvents = events.filter(e => e.type === 'conversationUpdated');
      expect(updateEvents.length).toBeLessThan(5);
    });
  });

  describe('session closed detection', () => {
    it('should emit sessionClosed event when marker file is removed', async () => {
      const events: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('session', (event) => {
        events.push(event);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-closed');
      mkdirSync(sessionDir);
      const markerPath = join(sessionDir, '.claudesettings.local.json');
      writeFileSync(markerPath, '{}');

      await new Promise(resolve => setTimeout(resolve, 1500));
      events.length = 0;

      rmSync(markerPath);

      await new Promise(resolve => setTimeout(resolve, 1500));

      const closeEvent = events.find(e => e.type === 'sessionClosed');
      expect(closeEvent).toBeDefined();
      expect(closeEvent?.sessionId).toBe('session-closed');
    });
  });

  describe('event listeners', () => {
    it('should allow registering multiple listeners', async () => {
      const events1: SessionEvent[] = [];
      const events2: SessionEvent[] = [];
      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('session', (event) => {
        events1.push(event);
      });

      watcher.on('session', (event) => {
        events2.push(event);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-multilistener');
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, '.claudesettings.local.json'), '{}');

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);
      expect(events1.length).toBe(events2.length);
    });

    it('should unregister listener when off is called', async () => {
      const events: SessionEvent[] = [];
      const listener = (event: SessionEvent) => {
        events.push(event);
      };

      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('session', listener);

      await watcher.start();

      const sessionDir1 = join(tempDir, 'session-1');
      mkdirSync(sessionDir1);
      writeFileSync(join(sessionDir1, '.claudesettings.local.json'), '{}');

      await new Promise(resolve => setTimeout(resolve, 1500));

      watcher.off('session', listener);

      const sessionDir2 = join(tempDir, 'session-2');
      mkdirSync(sessionDir2);
      writeFileSync(join(sessionDir2, '.claudesettings.local.json'), '{}');

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(events.length).toBe(1);
    });

    it('should handle error in listener gracefully', async () => {
      const errorEvents: Error[] = [];
      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('session', () => {
        throw new Error('Test listener error');
      });

      watcher.on('error', (error) => {
        errorEvents.push(error);
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-error');
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, '.claudesettings.local.json'), '{}');

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].message).toContain('Error in session event listener');
    });
  });

  describe('error handling', () => {
    it('should handle error listener errors without crashing', async () => {
      const errors: Error[] = [];
      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('error', () => {
        throw new Error('Error in error listener');
      });

      watcher.on('session', (event) => {
        errors.push(new Error(`Received event: ${event.type}`));
      });

      await watcher.start();

      const sessionDir = join(tempDir, 'session-test');
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, '.claudesettings.local.json'), '{}');

      await new Promise(resolve => setTimeout(resolve, 1500));

      const sessionEvents = errors.filter(e => e.message.includes('Received event'));
      expect(sessionEvents.length).toBeGreaterThan(0);
    });
  });

  describe('createFileWatcher convenience function', () => {
    it('should create FileWatcher with default options', () => {
      const fnWatcher = createFileWatcher();

      expect(fnWatcher).toBeInstanceOf(FileWatcher);
      expect(fnWatcher.isWatching()).toBe(false);
    });

    it('should create FileWatcher with custom options', () => {
      const options: FileWatcherOptions = {
        watchPath: '/custom/path',
        debounceDelay: 500,
        ignoreInitial: true,
      };

      const fnWatcher = createFileWatcher(options);

      expect(fnWatcher).toBeInstanceOf(FileWatcher);
      expect(fnWatcher.isWatching()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clear all listeners on stop', async () => {
      watcher = new FileWatcher({ watchPath: tempDir });

      watcher.on('session', () => {});
      watcher.on('error', () => {});

      await watcher.start();
      await watcher.stop();

      expect(watcher.isWatching()).toBe(false);
    });

    it('should clear debounce timers on stop', async () => {
      watcher = new FileWatcher({ watchPath: tempDir, debounceDelay: 10000 });

      watcher.on('session', () => {});

      await watcher.start();

      const sessionDir = join(tempDir, 'session-cleanup');
      mkdirSync(sessionDir);
      writeFileSync(join(sessionDir, '.claudesettings.local.json'), '{}');

      await watcher.stop();

      expect(watcher.isWatching()).toBe(false);
    });
  });
});
