/**
 * Unit tests for ErrorPatternDetector analyzer.
 *
 * Tests cover:
 * - Tool error rate detection with threshold enforcement
 * - Repeated error message detection
 * - Recovery pattern detection (tools used after errors)
 * - Edge cases (empty messages, no errors, below threshold)
 * - Integration (all observation types together)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ErrorPatternDetector } from '../../src/analyzers/error-pattern';
import type { Session, Message } from '../../src/core/types';

describe('ErrorPatternDetector', () => {
  let detector: ErrorPatternDetector;
  let session: Session;

  beforeEach(() => {
    detector = new ErrorPatternDetector();
    session = {
      id: 'test-session-001',
      tool: 'claude-code',
      createdAt: new Date('2026-01-27T10:00:00Z'),
      modifiedAt: new Date('2026-01-27T11:00:00Z'),
      path: '/test/session.jsonl',
      messageCount: 10,
    };
  });

  describe('tool error rate detection', () => {
    it('should detect tools with high error rates', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Running bash',
          toolUses: [{ id: '1', name: 'bash', input: { command: 'ls' }, result: 'Error: not found', success: false }],
        },
        {
          role: 'assistant',
          content: 'Retrying bash',
          toolUses: [{ id: '2', name: 'bash', input: { command: 'pwd' }, result: 'Error: permission denied', success: false }],
        },
        {
          role: 'assistant',
          content: 'Bash succeeded',
          toolUses: [{ id: '3', name: 'bash', input: { command: 'echo hi' }, result: 'hi', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const errorRateObs = observations.find(o => o.text.includes('fails') && o.text.includes('bash'));

      expect(errorRateObs).toBeDefined();
      expect(errorRateObs!.category).toBe('pattern');
      expect(errorRateObs!.metadata!.toolName).toBe('bash');
      expect(errorRateObs!.metadata!.errorCount).toBe(2);
      expect(errorRateObs!.metadata!.totalCalls).toBe(3);
      expect(errorRateObs!.metadata!.errorRate).toBeCloseTo(2 / 3, 2);
    });

    it('should not report tools below minimum error count threshold', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'One error',
          toolUses: [{ id: '1', name: 'read', input: { path: 'x' }, result: 'Not found', success: false }],
        },
        {
          role: 'assistant',
          content: 'Success',
          toolUses: [{ id: '2', name: 'read', input: { path: 'y' }, result: 'content', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const errorRateObs = observations.find(o => o.text.includes('fails') && o.text.includes('read'));

      expect(errorRateObs).toBeUndefined();
    });

    it('should not report tools below minimum error rate threshold', async () => {
      // 2 errors out of 20 calls = 10% error rate (below 20% threshold)
      const messages: Message[] = [];
      for (let i = 0; i < 18; i++) {
        messages.push({
          role: 'assistant',
          content: `Success ${i}`,
          toolUses: [{ id: `s${i}`, name: 'edit', input: {}, result: 'ok', success: true }],
        });
      }
      messages.push({
        role: 'assistant',
        content: 'Error 1',
        toolUses: [{ id: 'e1', name: 'edit', input: {}, result: 'err', success: false }],
      });
      messages.push({
        role: 'assistant',
        content: 'Error 2',
        toolUses: [{ id: 'e2', name: 'edit', input: {}, result: 'err', success: false }],
      });

      const observations = await detector.analyze(session, messages);
      const errorRateObs = observations.find(o => o.text.includes('fails') && o.text.includes('edit'));

      expect(errorRateObs).toBeUndefined();
    });

    it('should include common error message in metadata', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Error 1',
          toolUses: [{ id: '1', name: 'bash', result: 'ENOENT: no such file', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error 2',
          toolUses: [{ id: '2', name: 'bash', result: 'ENOENT: no such file', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error 3',
          toolUses: [{ id: '3', name: 'bash', result: 'Permission denied', success: false }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const errorRateObs = observations.find(o => o.text.includes('fails') && o.text.includes('bash'));

      expect(errorRateObs).toBeDefined();
      expect(errorRateObs!.metadata!.commonErrorMessage).toBe('ENOENT: no such file');
    });
  });

  describe('repeated error message detection', () => {
    it('should detect frequently repeated error messages', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Error a',
          toolUses: [{ id: '1', name: 'bash', result: 'Module not found: react', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error b',
          toolUses: [{ id: '2', name: 'bash', result: 'Module not found: react', success: false }],
        },
        {
          role: 'assistant',
          content: 'Different error',
          toolUses: [{ id: '3', name: 'bash', result: 'Syntax error at line 5', success: false }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const repeatedObs = observations.find(o => o.text.includes('Recurring error') && o.text.includes('Module not found'));

      expect(repeatedObs).toBeDefined();
      expect(repeatedObs!.category).toBe('pattern');
      expect(repeatedObs!.metadata!.commonErrorMessage).toBe('Module not found: react');
      expect(repeatedObs!.metadata!.errorCount).toBe(2);
    });

    it('should not report single-occurrence error messages', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Unique error 1',
          toolUses: [{ id: '1', name: 'bash', result: 'Unique error A', success: false }],
        },
        {
          role: 'assistant',
          content: 'Unique error 2',
          toolUses: [{ id: '2', name: 'bash', result: 'Unique error B', success: false }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const recurringObs = observations.filter(o => o.text.includes('Recurring error'));

      expect(recurringObs).toHaveLength(0);
    });

    it('should truncate long error messages to 100 characters', async () => {
      const longMessage = 'A'.repeat(200);
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Long error 1',
          toolUses: [{ id: '1', name: 'bash', result: longMessage, success: false }],
        },
        {
          role: 'assistant',
          content: 'Long error 2',
          toolUses: [{ id: '2', name: 'bash', result: longMessage, success: false }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const recurringObs = observations.find(o => o.text.includes('Recurring error'));

      expect(recurringObs).toBeDefined();
      expect(recurringObs!.metadata!.commonErrorMessage!.length).toBeLessThanOrEqual(100);
    });
  });

  describe('recovery pattern detection', () => {
    it('should detect common recovery tools after errors', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Bash failed',
          toolUses: [{ id: '1', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Reading file first',
          toolUses: [{ id: '2', name: 'read', result: 'file content', success: true }],
        },
        {
          role: 'assistant',
          content: 'Bash failed again',
          toolUses: [{ id: '3', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Reading again',
          toolUses: [{ id: '4', name: 'read', result: 'file content', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const recoveryObs = observations.find(o => o.text.includes('recover'));

      expect(recoveryObs).toBeDefined();
      expect(recoveryObs!.category).toBe('workflow');
      expect(recoveryObs!.text).toContain('bash');
      expect(recoveryObs!.text).toContain('read');
      expect(recoveryObs!.metadata!.recoveryTools).toContain('read');
    });

    it('should not report recovery patterns below threshold', async () => {
      // Only 1 recovery instance (below MIN_ERROR_COUNT of 2)
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Single error',
          toolUses: [{ id: '1', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Recovery attempt',
          toolUses: [{ id: '2', name: 'read', result: 'content', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const recoveryObs = observations.find(o => o.text.includes('recover'));

      expect(recoveryObs).toBeUndefined();
    });

    it('should identify dominant recovery tool among mixed recoveries', async () => {
      const messages: Message[] = [
        // Error -> read recovery (3 times)
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: 'e1', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Read recovery',
          toolUses: [{ id: 'r1', name: 'read', result: 'ok', success: true }],
        },
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: 'e2', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Read recovery',
          toolUses: [{ id: 'r2', name: 'read', result: 'ok', success: true }],
        },
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: 'e3', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Read recovery',
          toolUses: [{ id: 'r3', name: 'read', result: 'ok', success: true }],
        },
        // Error -> edit recovery (1 time, minority)
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: 'e4', name: 'bash', result: 'Error', success: false }],
        },
        {
          role: 'assistant',
          content: 'Edit recovery',
          toolUses: [{ id: 'r4', name: 'edit', result: 'ok', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      const recoveryObs = observations.find(o => o.text.includes('recover'));

      expect(recoveryObs).toBeDefined();
      expect(recoveryObs!.text).toContain('"read"');
      expect(recoveryObs!.text).toContain('3 times');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for messages with no tool uses', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });

    it('should return empty array for empty messages', async () => {
      const observations = await detector.analyze(session, []);
      expect(observations).toHaveLength(0);
    });

    it('should return empty array when all tool calls succeed', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Success',
          toolUses: [{ id: '1', name: 'bash', result: 'ok', success: true }],
        },
        {
          role: 'assistant',
          content: 'Success',
          toolUses: [{ id: '2', name: 'read', result: 'content', success: true }],
        },
        {
          role: 'assistant',
          content: 'Success',
          toolUses: [{ id: '3', name: 'edit', result: 'done', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });

    it('should handle tool uses with no result string on failure', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Error no result',
          toolUses: [{ id: '1', name: 'bash', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error no result',
          toolUses: [{ id: '2', name: 'bash', success: false }],
        },
      ];

      // Should not throw, should still detect error rate
      const observations = await detector.analyze(session, messages);
      const errorRateObs = observations.find(o => o.text.includes('fails') && o.text.includes('bash'));
      expect(errorRateObs).toBeDefined();
    });

    it('should handle tool uses with undefined success (treat as success)', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Ambiguous',
          toolUses: [{ id: '1', name: 'bash', result: 'output' }],
        },
        {
          role: 'assistant',
          content: 'Ambiguous',
          toolUses: [{ id: '2', name: 'bash', result: 'output' }],
        },
      ];

      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });

    it('should handle messages with empty toolUses array', async () => {
      const messages: Message[] = [
        { role: 'assistant', content: 'No tools', toolUses: [] },
        { role: 'assistant', content: 'No tools', toolUses: [] },
      ];

      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });
  });

  describe('observation structure', () => {
    it('should create observations with valid UUIDs', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: '1', name: 'bash', result: 'fail', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: '2', name: 'bash', result: 'fail', success: false }],
        },
      ];

      const observations = await detector.analyze(session, messages);

      for (const obs of observations) {
        expect(obs.id).toBeDefined();
        expect(obs.id.length).toBeGreaterThan(0);
        // UUID format check
        expect(obs.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }
    });

    it('should set pending status on all observations', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: '1', name: 'bash', result: 'fail', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: '2', name: 'bash', result: 'fail', success: false }],
        },
      ];

      const observations = await detector.analyze(session, messages);

      for (const obs of observations) {
        expect(obs.status).toBe('pending');
        expect(obs.count).toBe(1);
        expect(obs.sourceSessionIds).toContain(session.id);
      }
    });

    it('should set timestamps on all observations', async () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: '1', name: 'bash', result: 'fail', success: false }],
        },
        {
          role: 'assistant',
          content: 'Error',
          toolUses: [{ id: '2', name: 'bash', result: 'fail', success: false }],
        },
      ];

      const before = new Date();
      const observations = await detector.analyze(session, messages);
      const after = new Date();

      for (const obs of observations) {
        expect(obs.firstSeen).toBeInstanceOf(Date);
        expect(obs.lastSeen).toBeInstanceOf(Date);
        expect(obs.firstSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(obs.lastSeen.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });
  });

  describe('integration - combined patterns', () => {
    it('should detect all observation types together', async () => {
      const messages: Message[] = [
        // Error rate: bash fails 2/3 times
        {
          role: 'assistant',
          content: 'Bash error 1',
          toolUses: [{ id: '1', name: 'bash', result: 'Command failed', success: false }],
        },
        {
          role: 'assistant',
          content: 'Read recovery 1',
          toolUses: [{ id: '2', name: 'read', result: 'ok', success: true }],
        },
        // Repeated error message
        {
          role: 'assistant',
          content: 'Bash error 2 same message',
          toolUses: [{ id: '3', name: 'bash', result: 'Command failed', success: false }],
        },
        {
          role: 'assistant',
          content: 'Read recovery 2',
          toolUses: [{ id: '4', name: 'read', result: 'ok', success: true }],
        },
        // Success
        {
          role: 'assistant',
          content: 'Bash success',
          toolUses: [{ id: '5', name: 'bash', result: 'output', success: true }],
        },
      ];

      const observations = await detector.analyze(session, messages);

      // Should have error rate observation
      const errorRateObs = observations.find(o => o.text.includes('fails'));
      expect(errorRateObs).toBeDefined();

      // Should have repeated error observation
      const repeatedObs = observations.find(o => o.text.includes('Recurring'));
      expect(repeatedObs).toBeDefined();

      // Should have recovery pattern observation
      const recoveryObs = observations.find(o => o.text.includes('recover'));
      expect(recoveryObs).toBeDefined();

      // All observations have unique IDs
      const ids = observations.map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should handle multiple tools with different error profiles', async () => {
      const messages: Message[] = [
        // bash: 2 errors, 1 success
        { role: 'assistant', content: '', toolUses: [{ id: 'b1', name: 'bash', result: 'err', success: false }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'b2', name: 'bash', result: 'err', success: false }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'b3', name: 'bash', result: 'ok', success: true }] },
        // read: 2 errors, 3 successes (low rate, should not trigger)
        { role: 'assistant', content: '', toolUses: [{ id: 'r1', name: 'read', result: 'err', success: false }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r2', name: 'read', result: 'err', success: false }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r3', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r4', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r5', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r6', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r7', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r8', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r9', name: 'read', result: 'ok', success: true }] },
        { role: 'assistant', content: '', toolUses: [{ id: 'r10', name: 'read', result: 'ok', success: true }] },
      ];

      const observations = await detector.analyze(session, messages);

      // bash should be reported (67% error rate)
      const bashObs = observations.find(o => o.text.includes('bash') && o.text.includes('fails'));
      expect(bashObs).toBeDefined();

      // read should NOT be reported (20% error rate = exactly at threshold boundary, 2/10)
      const readObs = observations.find(o => o.text.includes('read') && o.text.includes('fails'));
      expect(readObs).toBeUndefined();
    });
  });
});
