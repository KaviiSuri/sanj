/**
 * Tests for LLM adapter interface and OpenCode implementation.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { OpenCodeLLMAdapter } from '../../src/adapters/llm/OpenCodeLLM';
import type { Observation } from '../../src/core/types';

describe('OpenCodeLLMAdapter', () => {
  let adapter: OpenCodeLLMAdapter;

  beforeEach(() => {
    adapter = new OpenCodeLLMAdapter();
  });

  describe('constructor', () => {
    it('should create adapter with default model', () => {
      expect(adapter.name).toBe('opencode-llm');
      expect(adapter.model).toBe('zai-coding-plan/glm-4.7');
    });

    it('should create adapter with custom model', () => {
      const customAdapter = new OpenCodeLLMAdapter('custom-model');
      expect(customAdapter.name).toBe('opencode-llm');
      expect(customAdapter.model).toBe('custom-model');
    });
  });

  describe('isAvailable', () => {
    it('should have isAvailable method', async () => {
      const result = await adapter.isAvailable();

      expect(typeof result).toBe('boolean');
    });
  });

  describe('extractPatterns', () => {
    it('should throw SanjError when OpenCode is not available', async () => {
      const isAvailableMock = mock(() => Promise.resolve(false));
      adapter.isAvailable = isAvailableMock;

      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        projectSlug: 'test-project',
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      await expect(adapter.extractPatterns(session)).rejects.toThrow('OpenCode is not available');
    });

    it('should return empty array for empty LLM response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => Promise.resolve(''));
      adapter['callOpenCode'] = callOpenCodeMock;

      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const result = await adapter.extractPatterns(session);

      expect(result).toEqual([]);
    });

    it('should parse valid LLM response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const mockResponse = JSON.stringify([
        {
          text: 'User prefers TypeScript over JavaScript',
          category: 'preference',
          confidence: 0.9,
        },
        {
          text: 'Always runs tests before committing',
          category: 'workflow',
          confidence: 0.85,
        },
      ]);

      const callOpenCodeMock = mock(() => Promise.resolve(mockResponse));
      adapter['callOpenCode'] = callOpenCodeMock;

      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const result = await adapter.extractPatterns(session);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('User prefers TypeScript over JavaScript');
      expect(result[0].category).toBe('preference');
      expect(result[0].count).toBe(1);
      expect(result[0].status).toBe('pending');
      expect(result[0].sourceSessionIds).toEqual(['test-session']);

      expect(result[1].text).toBe('Always runs tests before committing');
      expect(result[1].category).toBe('workflow');
    });

    it('should filter observations with confidence < 0.6', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const mockResponse = JSON.stringify([
        {
          text: 'High confidence observation',
          category: 'preference',
          confidence: 0.9,
        },
        {
          text: 'Low confidence observation',
          category: 'preference',
          confidence: 0.5,
        },
      ]);

      const callOpenCodeMock = mock(() => Promise.resolve(mockResponse));
      adapter['callOpenCode'] = callOpenCodeMock;

      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const result = await adapter.extractPatterns(session);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('High confidence observation');
    });

    it('should handle invalid JSON response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => Promise.resolve('invalid json'));
      adapter['callOpenCode'] = callOpenCodeMock;

      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const result = await adapter.extractPatterns(session);

      expect(result).toEqual([]);
    });

    it('should handle non-array response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => Promise.resolve('{"not": "an array"}'));
      adapter['callOpenCode'] = callOpenCodeMock;

      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const result = await adapter.extractPatterns(session);

      expect(result).toEqual([]);
    });
  });

  describe('checkSimilarity', () => {
    it('should return false when OpenCode is not available', async () => {
      const isAvailableMock = mock(() => Promise.resolve(false));
      adapter.isAvailable = isAvailableMock;

      const obsA: Observation = {
        id: '1',
        text: 'Observation A',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-1'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const obsB: Observation = {
        id: '2',
        text: 'Observation B',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-2'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const result = await adapter.checkSimilarity(obsA, obsB);

      expect(result).toBe(false);
    });

    it('should return true for YES response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => Promise.resolve('YES'));
      adapter['callOpenCode'] = callOpenCodeMock;

      const obsA: Observation = {
        id: '1',
        text: 'Prefers TypeScript',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-1'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const obsB: Observation = {
        id: '2',
        text: 'Loves TypeScript',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-2'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const result = await adapter.checkSimilarity(obsA, obsB);

      expect(result).toBe(true);
    });

    it('should return false for NO response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => Promise.resolve('NO'));
      adapter['callOpenCode'] = callOpenCodeMock;

      const obsA: Observation = {
        id: '1',
        text: 'Prefers TypeScript',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-1'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const obsB: Observation = {
        id: '2',
        text: 'Prefers JavaScript',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-2'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const result = await adapter.checkSimilarity(obsA, obsB);

      expect(result).toBe(false);
    });

    it('should return false for unclear response', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => Promise.resolve('maybe'));
      adapter['callOpenCode'] = callOpenCodeMock;

      const obsA: Observation = {
        id: '1',
        text: 'Prefers TypeScript',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-1'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const obsB: Observation = {
        id: '2',
        text: 'Loves TypeScript',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-2'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const result = await adapter.checkSimilarity(obsA, obsB);

      expect(result).toBe(false);
    });

    it('should return false on exception', async () => {
      const isAvailableMock = mock(() => Promise.resolve(true));
      adapter.isAvailable = isAvailableMock;

      const callOpenCodeMock = mock(() => {
        throw new Error('OpenCode failed');
      });
      adapter['callOpenCode'] = callOpenCodeMock;

      const obsA: Observation = {
        id: '1',
        text: 'Observation A',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-1'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const obsB: Observation = {
        id: '2',
        text: 'Observation B',
        count: 1,
        status: 'pending',
        sourceSessionIds: ['session-2'],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const result = await adapter.checkSimilarity(obsA, obsB);

      expect(result).toBe(false);
    });
  });

  describe('createObservation', () => {
    it('should create valid observation from valid item', () => {
      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const item = {
        text: 'Prefers TypeScript',
        category: 'preference',
        confidence: 0.9,
      };

      const result = adapter['createObservation'](item, session);

      expect(result).not.toBeNull();
      expect(result!.id).toBeDefined();
      expect(result!.text).toBe('Prefers TypeScript');
      expect(result!.category).toBe('preference');
      expect(result!.count).toBe(1);
      expect(result!.status).toBe('pending');
      expect(result!.sourceSessionIds).toEqual(['test-session']);
    });

    it('should return null for invalid item', () => {
      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const result = adapter['createObservation'](null, session);

      expect(result).toBeNull();
    });

    it('should default category to other for invalid category', () => {
      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const item = {
        text: 'Some observation',
        category: 'invalid',
        confidence: 0.9,
      };

      const result = adapter['createObservation'](item, session);

      expect(result).not.toBeNull();
      expect(result!.category).toBe('other');
    });

    it('should trim text', () => {
      const session = {
        id: 'test-session',
        tool: 'claude-code' as const,
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: '/test/path',
        messageCount: 10,
      };

      const item = {
        text: '  Trim me  ',
        category: 'preference',
        confidence: 0.9,
      };

      const result = adapter['createObservation'](item, session);

      expect(result).not.toBeNull();
      expect(result!.text).toBe('Trim me');
    });
  });
});
