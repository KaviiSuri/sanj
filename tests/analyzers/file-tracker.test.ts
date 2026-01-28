/**
 * Tests for FileInteractionTracker analyzer.
 *
 * Why these tests matter:
 * - File interaction tracking is a core pattern detection capability
 * - Validates that file paths are correctly extracted from various tool input formats
 * - Ensures hotspot detection works at the configured threshold
 * - Confirms that frequently-modified and top-files observations are accurate
 * - Guards against regressions in path normalization and edge cases
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { FileInteractionTracker } from '../../src/analyzers/file-tracker';
import type { Session, Message } from '../../src/core/types';

function makeSession(id = 'test-session'): Session {
  return {
    id,
    tool: 'claude-code',
    createdAt: new Date(),
    modifiedAt: new Date(),
    path: '/tmp/session',
    messageCount: 0,
  };
}

function makeMessage(toolUses?: Message['toolUses']): Message {
  return {
    role: 'assistant',
    content: 'test message',
    toolUses,
  };
}

function makeToolUse(name: string, input?: Record<string, unknown>, success?: boolean) {
  return {
    id: crypto.randomUUID(),
    name,
    input,
    success,
  };
}

describe('FileInteractionTracker', () => {
  let tracker: FileInteractionTracker;
  let session: Session;

  beforeEach(() => {
    tracker = new FileInteractionTracker();
    session = makeSession();
  });

  describe('basic setup', () => {
    test('has correct analyzer name', () => {
      expect(tracker.name).toBe('file-interaction');
    });

    test('returns empty observations for no messages', async () => {
      const result = await tracker.analyze(session, []);
      expect(result).toEqual([]);
    });

    test('returns empty observations for messages without tool uses', async () => {
      const messages = [
        makeMessage(),
        { role: 'user' as const, content: 'hello' },
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });

    test('returns empty observations for non-file tool uses', async () => {
      const messages = [
        makeMessage([makeToolUse('bash', { command: 'echo hello' })]),
        makeMessage([makeToolUse('bash', { command: 'ls -la' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });
  });

  describe('file path extraction', () => {
    test('extracts file_path parameter (snake_case)', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(obs => obs.text.includes('/src/index.ts'))).toBe(true);
    });

    test('extracts filePath parameter (camelCase)', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { filePath: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { filePath: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { filePath: '/src/app.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes('/src/app.ts'))).toBe(true);
    });

    test('extracts path parameter (generic)', async () => {
      const messages = [
        makeMessage([makeToolUse('read', { path: '/src/utils.ts' })]),
        makeMessage([makeToolUse('edit', { path: '/src/utils.ts' })]),
        makeMessage([makeToolUse('edit', { path: '/src/utils.ts' })]),
        makeMessage([makeToolUse('edit', { path: '/src/utils.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes('/src/utils.ts'))).toBe(true);
    });

    test('ignores tool uses with no file path input', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', {})]),
        makeMessage([makeToolUse('Edit', { content: 'some text' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });

    test('ignores tool uses with empty string file path', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '   ' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });

    test('ignores non-file tools without path parameters', async () => {
      const messages = [
        makeMessage([makeToolUse('bash', { command: 'cat /foo/bar.ts' })]),
        makeMessage([makeToolUse('bash', { command: 'cat /foo/bar.ts' })]),
        makeMessage([makeToolUse('bash', { command: 'cat /foo/bar.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });
  });

  describe('path normalization', () => {
    test('normalizes multiple slashes in paths', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src//index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      // Both paths should normalize to the same file
      const editCount = result.filter(obs => obs.text.includes('/src/index.ts'));
      expect(editCount.length).toBeGreaterThan(0);
    });

    test('removes trailing slash from paths', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/dir/' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/dir' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/dir' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const editCount = result.filter(obs => obs.text.includes('/src/dir'));
      expect(editCount.length).toBeGreaterThan(0);
    });

    test('treats relative and absolute paths as distinct', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: 'src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: 'src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: 'src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/index.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      // Both should appear since they're distinct paths
      const relativeObs = result.filter(obs => obs.text.includes('src/index.ts') && !obs.text.includes('/src/index.ts'));
      const absoluteObs = result.filter(obs => obs.text.includes('/src/index.ts'));
      expect(relativeObs.length).toBeGreaterThan(0);
      expect(absoluteObs.length).toBeGreaterThan(0);
    });
  });

  describe('frequently modified detection', () => {
    test('reports files with 3 or more edits', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.filter(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/app.ts')
      );
      expect(frequentObs.length).toBe(1);
      expect(frequentObs[0]!.text).toContain('3 times');
    });

    test('does not report files with fewer than 3 edits', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.filter(obs => obs.text.includes('modified'))).toHaveLength(0);
    });

    test('includes correct metadata for frequently modified files', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/app.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.find(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/app.ts')
      );
      expect(frequentObs).toBeDefined();
      expect(frequentObs!.metadata!['readCount']).toBe(1);
      expect(frequentObs!.metadata!['editCount']).toBe(3);
      expect(frequentObs!.metadata!['filePath']).toBe('/src/app.ts');
    });

    test('handles Write tool as edit operation', async () => {
      const messages = [
        makeMessage([makeToolUse('Write', { file_path: '/src/new.ts' })]),
        makeMessage([makeToolUse('Write', { file_path: '/src/new.ts' })]),
        makeMessage([makeToolUse('Write', { file_path: '/src/new.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.find(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/new.ts')
      );
      expect(frequentObs).toBeDefined();
      expect(frequentObs!.metadata!['editCount']).toBe(3);
    });
  });

  describe('hotspot detection', () => {
    test('detects hotspots at 10+ edits', async () => {
      const messages = Array.from({ length: 10 }, () =>
        makeMessage([makeToolUse('Edit', { file_path: '/src/hotspot.ts' })])
      );
      const result = await tracker.analyze(session, messages);
      const hotspotObs = result.find(obs => obs.text.includes('Hotspot'));
      expect(hotspotObs).toBeDefined();
      expect(hotspotObs!.text).toContain('/src/hotspot.ts');
      expect(hotspotObs!.text).toContain('10 edits');
      expect(hotspotObs!.metadata!['isHotspot']).toBe(true);
    });

    test('does not detect hotspot at 9 edits', async () => {
      const messages = Array.from({ length: 9 }, () =>
        makeMessage([makeToolUse('Edit', { file_path: '/src/almost.ts' })])
      );
      const result = await tracker.analyze(session, messages);
      const hotspotObs = result.find(obs => obs.text.includes('Hotspot'));
      expect(hotspotObs).toBeUndefined();
    });

    test('hotspot observation has correct category', async () => {
      const messages = Array.from({ length: 10 }, () =>
        makeMessage([makeToolUse('Edit', { file_path: '/src/hot.ts' })])
      );
      const result = await tracker.analyze(session, messages);
      const hotspotObs = result.find(obs => obs.text.includes('Hotspot'));
      expect(hotspotObs!.category).toBe('pattern');
    });

    test('file with 10+ edits produces both hotspot and frequently-modified observations', async () => {
      const messages = Array.from({ length: 12 }, () =>
        makeMessage([makeToolUse('Edit', { file_path: '/src/multi.ts' })])
      );
      const result = await tracker.analyze(session, messages);
      const hotspotObs = result.find(obs => obs.text.includes('Hotspot'));
      const frequentObs = result.find(obs => obs.text.includes('modified'));
      expect(hotspotObs).toBeDefined();
      expect(frequentObs).toBeDefined();
    });
  });

  describe('top files analysis', () => {
    test('reports most active files when multiple files exist', async () => {
      const messages = [
        // File A: 5 interactions
        makeMessage([makeToolUse('Read', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/a.ts' })]),
        // File B: 3 interactions
        makeMessage([makeToolUse('Read', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const topObs = result.find(obs => obs.text.includes('Most active'));
      expect(topObs).toBeDefined();
      expect(topObs!.text).toContain('/src/a.ts');
      expect(topObs!.text).toContain('/src/b.ts');
    });

    test('does not report top files when only one file exists', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/single.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/single.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/single.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const topObs = result.find(obs => obs.text.includes('Most active'));
      expect(topObs).toBeUndefined();
    });

    test('limits top files to 5', async () => {
      // Create 8 files each with 3 edits
      const files = Array.from({ length: 8 }, (_, i) => `/src/file${i}.ts`);
      const messages: Message[] = [];
      for (const file of files) {
        messages.push(
          makeMessage([makeToolUse('Edit', { file_path: file })]),
          makeMessage([makeToolUse('Edit', { file_path: file })]),
          makeMessage([makeToolUse('Edit', { file_path: file })]),
        );
      }
      const result = await tracker.analyze(session, messages);
      const topObs = result.find(obs => obs.text.includes('Most active'));
      expect(topObs).toBeDefined();
      // topFiles metadata should have at most 5 entries
      const topFiles = topObs!.metadata!['topFiles'] as Array<unknown>;
      expect(topFiles.length).toBeLessThanOrEqual(5);
    });

    test('sorts top files by total interactions descending', async () => {
      const messages = [
        // File A: 4 interactions
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/a.ts' })]),
        // File B: 6 interactions
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/b.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const topObs = result.find(obs => obs.text.includes('Most active'));
      expect(topObs).toBeDefined();
      // b.ts should appear first (6 interactions vs 4)
      const text = topObs!.text;
      expect(text.indexOf('/src/b.ts')).toBeLessThan(text.indexOf('/src/a.ts'));
    });

    test('does not report top files when top file has fewer than 3 interactions', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/b.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const topObs = result.find(obs => obs.text.includes('Most active'));
      expect(topObs).toBeUndefined();
    });
  });

  describe('read vs write tracking', () => {
    test('correctly counts reads separately from writes', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/mixed.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.find(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/mixed.ts')
      );
      expect(frequentObs).toBeDefined();
      expect(frequentObs!.metadata!['readCount']).toBe(2);
      expect(frequentObs!.metadata!['editCount']).toBe(3);
      expect(frequentObs!.metadata!['totalInteractions']).toBe(5);
    });

    test('read-only files are not reported as frequently modified', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/readonly.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/readonly.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/readonly.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/readonly.ts' })]),
        makeMessage([makeToolUse('Read', { file_path: '/src/readonly.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.find(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/readonly.ts')
      );
      // Reads don't count as edits, so no "modified" observation
      expect(frequentObs).toBeUndefined();
    });
  });

  describe('observation properties', () => {
    test('observations have valid UUIDs as IDs', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/id.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/id.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/id.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      for (const obs of result) {
        expect(obs.id).toBeDefined();
        expect(obs.id.length).toBeGreaterThan(0);
        // UUID format check
        expect(obs.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }
    });

    test('observations have pending status', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/status.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/status.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/status.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      for (const obs of result) {
        expect(obs.status).toBe('pending');
      }
    });

    test('observations reference the session ID', async () => {
      const customSession = makeSession('my-custom-session');
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/ref.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/ref.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/ref.ts' })]),
      ];
      const result = await tracker.analyze(customSession, messages);
      for (const obs of result) {
        expect(obs.sourceSessionIds).toContain('my-custom-session');
      }
    });

    test('observations have timestamps', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/ts.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/ts.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/ts.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      for (const obs of result) {
        expect(obs.firstSeen).toBeInstanceOf(Date);
        expect(obs.lastSeen).toBeInstanceOf(Date);
      }
    });

    test('observations have pattern category', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/cat.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/cat.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/cat.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      for (const obs of result) {
        expect(obs.category).toBe('pattern');
      }
    });
  });

  describe('tool name case handling', () => {
    test('handles lowercase tool names', async () => {
      const messages = [
        makeMessage([makeToolUse('read', { file_path: '/src/lower.ts' })]),
        makeMessage([makeToolUse('edit', { file_path: '/src/lower.ts' })]),
        makeMessage([makeToolUse('edit', { file_path: '/src/lower.ts' })]),
        makeMessage([makeToolUse('edit', { file_path: '/src/lower.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes('/src/lower.ts'))).toBe(true);
    });

    test('handles uppercase tool names', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/upper.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/upper.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/upper.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/upper.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes('/src/upper.ts'))).toBe(true);
    });

    test('handles mixed case Write tool', async () => {
      const messages = [
        makeMessage([makeToolUse('Write', { file_path: '/src/write.ts' })]),
        makeMessage([makeToolUse('Write', { file_path: '/src/write.ts' })]),
        makeMessage([makeToolUse('Write', { file_path: '/src/write.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes('/src/write.ts'))).toBe(true);
    });
  });

  describe('multiple messages with mixed tools', () => {
    test('handles interleaved file and non-file tool uses', async () => {
      const messages = [
        makeMessage([makeToolUse('Read', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('bash', { command: 'npm test' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('bash', { command: 'npm test' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/mixed.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/mixed.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.find(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/mixed.ts')
      );
      expect(frequentObs).toBeDefined();
      expect(frequentObs!.metadata!['editCount']).toBe(3);
    });

    test('tracks multiple files simultaneously', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/a.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/b.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      const aObs = result.find(obs => obs.text.includes('/src/a.ts') && obs.text.includes('modified'));
      const bObs = result.find(obs => obs.text.includes('/src/b.ts') && obs.text.includes('modified'));
      expect(aObs).toBeDefined();
      expect(bObs).toBeDefined();
      expect(aObs!.metadata!['editCount']).toBe(3);
      expect(bObs!.metadata!['editCount']).toBe(3);
    });

    test('handles messages with multiple tool uses', async () => {
      const messages = [
        makeMessage([
          makeToolUse('Read', { file_path: '/src/multi.ts' }),
          makeToolUse('Edit', { file_path: '/src/multi.ts' }),
        ]),
        makeMessage([
          makeToolUse('Edit', { file_path: '/src/multi.ts' }),
        ]),
        makeMessage([
          makeToolUse('Edit', { file_path: '/src/multi.ts' }),
        ]),
      ];
      const result = await tracker.analyze(session, messages);
      const frequentObs = result.find(obs =>
        obs.text.includes('modified') && obs.text.includes('/src/multi.ts')
      );
      expect(frequentObs).toBeDefined();
      expect(frequentObs!.metadata!['editCount']).toBe(3);
      expect(frequentObs!.metadata!['readCount']).toBe(1);
    });
  });

  describe('edge cases', () => {
    test('handles non-string file_path values gracefully', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: 123 as unknown as string })]),
        makeMessage([makeToolUse('Edit', { file_path: null as unknown as string })]),
        makeMessage([makeToolUse('Edit', { file_path: undefined as unknown as string })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });

    test('handles messages with undefined toolUses', async () => {
      const messages: Message[] = [
        { role: 'assistant', content: 'hello', toolUses: undefined },
        { role: 'user', content: 'hi' },
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });

    test('handles messages with empty toolUses array', async () => {
      const messages: Message[] = [
        { role: 'assistant', content: 'hello', toolUses: [] },
      ];
      const result = await tracker.analyze(session, messages);
      expect(result).toEqual([]);
    });

    test('handles very long file paths', async () => {
      const longPath = '/src/' + 'a'.repeat(200) + '/file.ts';
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: longPath })]),
        makeMessage([makeToolUse('Edit', { file_path: longPath })]),
        makeMessage([makeToolUse('Edit', { file_path: longPath })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes(longPath))).toBe(true);
    });

    test('handles special characters in file paths', async () => {
      const specialPath = '/src/my file (copy).ts';
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: specialPath })]),
        makeMessage([makeToolUse('Edit', { file_path: specialPath })]),
        makeMessage([makeToolUse('Edit', { file_path: specialPath })]),
      ];
      const result = await tracker.analyze(session, messages);
      expect(result.some(obs => obs.text.includes(specialPath))).toBe(true);
    });
  });

  describe('integration with session context', () => {
    test('produces observations with correct count of 1', async () => {
      const messages = [
        makeMessage([makeToolUse('Edit', { file_path: '/src/count.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/count.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/count.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);
      for (const obs of result) {
        expect(obs.count).toBe(1);
      }
    });

    test('realistic session with multiple files and operations', async () => {
      const messages = [
        // Start: read the main file
        makeMessage([makeToolUse('Read', { file_path: '/src/core/engine.ts' })]),
        // Edit it several times
        makeMessage([makeToolUse('Edit', { file_path: '/src/core/engine.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/core/engine.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/core/engine.ts' })]),
        // Run tests
        makeMessage([makeToolUse('bash', { command: 'bun test' })]),
        // Read test file
        makeMessage([makeToolUse('Read', { file_path: '/tests/core/engine.test.ts' })]),
        // Edit test file
        makeMessage([makeToolUse('Edit', { file_path: '/tests/core/engine.test.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/tests/core/engine.test.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/tests/core/engine.test.ts' })]),
        // More edits to main file
        makeMessage([makeToolUse('Edit', { file_path: '/src/core/engine.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/core/engine.ts' })]),
        makeMessage([makeToolUse('Edit', { file_path: '/src/core/engine.ts' })]),
      ];
      const result = await tracker.analyze(session, messages);

      // engine.ts should be frequently modified (6 edits)
      const engineObs = result.find(obs => obs.text.includes('engine.ts') && obs.text.includes('modified'));
      expect(engineObs).toBeDefined();
      expect(engineObs!.metadata!['editCount']).toBe(6);

      // test file should also be frequently modified (3 edits)
      const testObs = result.find(obs => obs.text.includes('engine.test.ts') && obs.text.includes('modified'));
      expect(testObs).toBeDefined();
      expect(testObs!.metadata!['editCount']).toBe(3);

      // Should have a top files observation
      const topObs = result.find(obs => obs.text.includes('Most active'));
      expect(topObs).toBeDefined();
      // engine.ts should be listed first (more interactions)
      expect(topObs!.text.indexOf('engine.ts')).toBeLessThan(topObs!.text.indexOf('engine.test.ts'));
    });
  });
});
