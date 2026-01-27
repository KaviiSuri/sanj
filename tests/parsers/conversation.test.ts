/**
 * Tests for conversation.jsonl parser
 */

import { describe, it, expect } from 'bun:test';
import { parseConversation, buildRawContent, parseConversationFile } from '../../src/parsers/conversation';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('parseConversation', () => {
  describe('valid JSONL parsing', () => {
    it('should parse simple user and assistant messages', () => {
      const content = `{"type":"user","message":{"role":"user","content":"Hello"},"timestamp":"2026-01-27T10:00:00.000Z","sessionId":"test-123"}
{"type":"assistant","message":{"role":"assistant","content":"Hi there"},"timestamp":"2026-01-27T10:00:01.000Z","sessionId":"test-123"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Hi there');
      expect(result.sessionId).toBe('test-123');
    });

    it('should parse array-based content with text blocks', () => {
      const content = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"First part"},{"type":"text","text":"Second part"}]},"timestamp":"2026-01-27T10:00:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('First part\n\nSecond part');
    });

    it('should extract sessionId from events', () => {
      const content = `{"type":"queue-operation","sessionId":"abc-123","timestamp":"2026-01-27T10:00:00.000Z"}
{"type":"user","message":{"role":"user","content":"Test"},"sessionId":"abc-123","timestamp":"2026-01-27T10:00:01.000Z"}`;

      const result = parseConversation(content);

      expect(result.sessionId).toBe('abc-123');
    });

    it('should extract cwd from events', () => {
      const content = `{"type":"user","message":{"role":"user","content":"Test"},"cwd":"/Users/test/project","timestamp":"2026-01-27T10:00:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.cwd).toBe('/Users/test/project');
    });

    it('should extract timestamps and calculate createdAt/modifiedAt', () => {
      const content = `{"type":"user","message":{"role":"user","content":"First"},"timestamp":"2026-01-27T10:00:00.000Z"}
{"type":"assistant","message":{"role":"assistant","content":"Second"},"timestamp":"2026-01-27T10:05:00.000Z"}
{"type":"user","message":{"role":"user","content":"Third"},"timestamp":"2026-01-27T10:10:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.createdAt).toEqual(new Date('2026-01-27T10:00:00.000Z'));
      expect(result.modifiedAt).toEqual(new Date('2026-01-27T10:10:00.000Z'));
    });

    it('should preserve message timestamps', () => {
      const content = `{"type":"user","message":{"role":"user","content":"Test"},"timestamp":"2026-01-27T10:00:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages[0].timestamp).toEqual(new Date('2026-01-27T10:00:00.000Z'));
    });

    it('should preserve message sequence', () => {
      const content = `{"type":"user","message":{"role":"user","content":"First"},"timestamp":"2026-01-27T10:00:00.000Z"}
{"type":"assistant","message":{"role":"assistant","content":"Second"},"timestamp":"2026-01-27T10:00:01.000Z"}
{"type":"user","message":{"role":"user","content":"Third"},"timestamp":"2026-01-27T10:00:02.000Z"}
{"type":"assistant","message":{"role":"assistant","content":"Fourth"},"timestamp":"2026-01-27T10:00:03.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].content).toBe('First');
      expect(result.messages[1].content).toBe('Second');
      expect(result.messages[2].content).toBe('Third');
      expect(result.messages[3].content).toBe('Fourth');
    });
  });

  describe('malformed input handling', () => {
    it('should skip malformed JSON lines gracefully', () => {
      const content = `{"type":"user","message":{"role":"user","content":"Valid"},"timestamp":"2026-01-27T10:00:00.000Z"}
{invalid json line}
{"type":"assistant","message":{"role":"assistant","content":"Also valid"},"timestamp":"2026-01-27T10:00:01.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Valid');
      expect(result.messages[1].content).toBe('Also valid');
    });

    it('should handle empty lines', () => {
      const content = `{"type":"user","message":{"role":"user","content":"First"},"timestamp":"2026-01-27T10:00:00.000Z"}

{"type":"assistant","message":{"role":"assistant","content":"Second"},"timestamp":"2026-01-27T10:00:01.000Z"}

`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(2);
    });

    it('should handle empty content', () => {
      const result = parseConversation('');

      expect(result.messages).toHaveLength(0);
      expect(result.sessionId).toBeUndefined();
      expect(result.cwd).toBeUndefined();
    });

    it('should handle content with only whitespace', () => {
      const result = parseConversation('   \n  \n  ');

      expect(result.messages).toHaveLength(0);
    });

    it('should skip events without message field', () => {
      const content = `{"type":"queue-operation","sessionId":"test","timestamp":"2026-01-27T10:00:00.000Z"}
{"type":"user","message":{"role":"user","content":"Valid message"},"timestamp":"2026-01-27T10:00:01.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Valid message');
    });

    it('should skip messages without role', () => {
      const content = `{"type":"event","message":{"content":"No role"},"timestamp":"2026-01-27T10:00:00.000Z"}
{"type":"user","message":{"role":"user","content":"Has role"},"timestamp":"2026-01-27T10:00:01.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Has role');
    });

    it('should skip messages without content', () => {
      const content = `{"type":"user","message":{"role":"user"},"timestamp":"2026-01-27T10:00:00.000Z"}
{"type":"user","message":{"role":"user","content":"Has content"},"timestamp":"2026-01-27T10:00:01.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Has content');
    });

    it('should handle invalid timestamp gracefully', () => {
      const content = `{"type":"user","message":{"role":"user","content":"Test"},"timestamp":"not-a-date"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.createdAt).toBeUndefined();
      expect(result.modifiedAt).toBeUndefined();
    });

    it('should handle missing timestamp', () => {
      const content = `{"type":"user","message":{"role":"user","content":"Test"}}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].timestamp).toBeUndefined();
    });
  });

  describe('array content extraction', () => {
    it('should extract text from mixed content blocks', () => {
      const content = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Text block"},{"type":"tool_use","id":"123","name":"Read"},{"type":"text","text":"More text"}]},"timestamp":"2026-01-27T10:00:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Text block\n\nMore text');
    });

    it('should handle content array with no text blocks', () => {
      const content = `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"123"}]},"timestamp":"2026-01-27T10:00:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(0);
    });

    it('should handle empty content array', () => {
      const content = `{"type":"assistant","message":{"role":"assistant","content":[]},"timestamp":"2026-01-27T10:00:00.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(0);
    });
  });

  describe('real-world format', () => {
    it('should parse Claude Code conversation format', () => {
      const content = `{"type":"queue-operation","operation":"dequeue","timestamp":"2026-01-27T07:19:05.336Z","sessionId":"01853388-c821-46c0-98ef-ea512e89b025"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/test/project","sessionId":"01853388-c821-46c0-98ef-ea512e89b025","version":"2.1.20","gitBranch":"main","type":"user","message":{"role":"user","content":"Hello, implement the feature"},"uuid":"test-uuid-1","timestamp":"2026-01-27T07:19:06.000Z"}
{"parentUuid":"test-uuid-1","isSidechain":false,"userType":"external","cwd":"/Users/test/project","sessionId":"01853388-c821-46c0-98ef-ea512e89b025","version":"2.1.20","gitBranch":"main","message":{"model":"claude-sonnet-4-5-20250929","id":"msg_123","type":"message","role":"assistant","content":[{"type":"text","text":"I'll help you implement the feature."}]},"type":"assistant","uuid":"test-uuid-2","timestamp":"2026-01-27T07:19:10.000Z"}`;

      const result = parseConversation(content);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello, implement the feature');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe("I'll help you implement the feature.");
      expect(result.sessionId).toBe('01853388-c821-46c0-98ef-ea512e89b025');
      expect(result.cwd).toBe('/Users/test/project');
    });
  });
});

describe('buildRawContent', () => {
  it('should format messages for LLM analysis', () => {
    const messages = [
      { role: 'user' as const, content: 'First message' },
      { role: 'assistant' as const, content: 'Second message' },
      { role: 'user' as const, content: 'Third message' },
    ];

    const result = buildRawContent(messages);

    expect(result).toBe('[User]: First message\n\n[Assistant]: Second message\n\n[User]: Third message');
  });

  it('should handle empty messages array', () => {
    const result = buildRawContent([]);

    expect(result).toBe('');
  });

  it('should handle single message', () => {
    const messages = [{ role: 'user' as const, content: 'Only message' }];

    const result = buildRawContent(messages);

    expect(result).toBe('[User]: Only message');
  });
});

describe('parseConversationFile', () => {
  const testDir = '/tmp/sanj-test-conversation-parser';
  const testFile = join(testDir, 'test-conversation.jsonl');

  it('should parse a valid conversation file', async () => {
    mkdirSync(testDir, { recursive: true });

    const content = `{"type":"user","message":{"role":"user","content":"Test"},"timestamp":"2026-01-27T10:00:00.000Z","sessionId":"file-test"}`;
    writeFileSync(testFile, content);

    const result = await parseConversationFile(testFile);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('Test');
    expect(result.sessionId).toBe('file-test');

    unlinkSync(testFile);
  });

  it('should return empty result for non-existent file', async () => {
    const result = await parseConversationFile('/tmp/non-existent-file.jsonl');

    expect(result.messages).toHaveLength(0);
    expect(result.sessionId).toBeUndefined();
  });

  it('should handle file read errors gracefully', async () => {
    const result = await parseConversationFile('/root/forbidden-file.jsonl');

    expect(result.messages).toHaveLength(0);
  });
});
