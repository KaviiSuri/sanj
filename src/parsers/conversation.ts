/**
 * Conversation file parser for Claude Code session files.
 *
 * Parses conversation.jsonl files (JSONL format) from Claude Code sessions
 * and extracts messages, timestamps, and metadata.
 *
 * Format: Each line is a JSON object representing a conversation event.
 */

import type { Message, ToolUse } from '../core/types';

/**
 * Raw event from conversation.jsonl file
 */
interface ConversationEvent {
  type?: string;
  message?: {
    role?: 'user' | 'assistant';
    content?: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  [key: string]: unknown;
}

/**
 * Result of content extraction (text and tool uses)
 */
interface ExtractedContent {
  text: string;
  toolUses: ToolUse[];
}

/**
 * Parsed conversation result
 */
export interface ParsedConversation {
  messages: Message[];
  sessionId?: string;
  cwd?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}

/**
 * Parse a conversation.jsonl file and extract messages and metadata.
 *
 * @param content - Full content of the conversation.jsonl file
 * @returns Parsed conversation with messages and metadata
 *
 * @example
 * ```typescript
 * const content = await Bun.file('conversation.jsonl').text();
 * const parsed = parseConversation(content);
 * console.log(`Found ${parsed.messages.length} messages`);
 * ```
 */
export function parseConversation(content: string): ParsedConversation {
  const messages: Message[] = [];
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let createdAt: Date | undefined;
  let modifiedAt: Date | undefined;

  const lines = content.split('\n').filter(line => line.trim().length > 0);

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as ConversationEvent;

      // Extract session metadata from first event
      if (!sessionId && event.sessionId) {
        sessionId = event.sessionId;
      }
      if (!cwd && event.cwd) {
        cwd = event.cwd;
      }

      // Parse timestamp
      const timestamp = event.timestamp ? new Date(event.timestamp) : undefined;
      if (timestamp && !isNaN(timestamp.getTime())) {
        if (!createdAt) {
          createdAt = timestamp;
        }
        modifiedAt = timestamp;
      }

      // Extract message if present
      if (event.message && event.message.role && event.message.content) {
        const extracted = extractContent(event.message.content);
        if (extracted.text || extracted.toolUses.length > 0) {
          messages.push({
            role: event.message.role,
            content: extracted.text,
            toolUses: extracted.toolUses.length > 0 ? extracted.toolUses : undefined,
            timestamp,
          });
        }
      }
    } catch (error) {
      // Skip malformed lines gracefully
      // In production, could log warning: console.warn(`Skipping malformed line: ${error}`);
      continue;
    }
  }

  return {
    messages,
    sessionId,
    cwd,
    createdAt,
    modifiedAt,
  };
}

/**
 * Extract content string from message content field.
 * Handles both string format and array format (with text/tool_use blocks).
 */
function extractContent(content: string | Array<{ type: string; text?: string; [key: string]: unknown }>): ExtractedContent {
  if (typeof content === 'string') {
    return { text: content, toolUses: [] };
  }

  if (Array.isArray(content)) {
    // Extract all text blocks
    const textBlocks = content
      .filter(block => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text as string);

    // Extract all tool_use blocks
    const toolUses: ToolUse[] = content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: crypto.randomUUID(),
        name: String((block as { name?: string }).name || 'unknown'),
        input: (block as { input?: Record<string, unknown> }).input,
        result: undefined,
        success: undefined,
      }));

    return {
      text: textBlocks.join('\n\n'),
      toolUses,
    };
  }

  return { text: '', toolUses: [] };
}

/**
 * Parse a conversation.jsonl file from a file path.
 *
 * @param filePath - Path to conversation.jsonl file
 * @returns Parsed conversation with messages and metadata
 *
 * @example
 * ```typescript
 * const parsed = await parseConversationFile('~/.claude/projects/my-project/session-id.jsonl');
 * ```
 */
export async function parseConversationFile(filePath: string): Promise<ParsedConversation> {
  try {
    const file = Bun.file(filePath);
    const content = await file.text();
    return parseConversation(content);
  } catch (error) {
    // Return empty result if file doesn't exist or can't be read
    return {
      messages: [],
    };
  }
}

/**
 * Build a raw content string suitable for LLM analysis.
 * Concatenates all messages with role labels.
 *
 * @param messages - Array of messages from parsed conversation
 * @returns Formatted string with all conversation content
 */
export function buildRawContent(messages: Message[]): string {
  return messages
    .map(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `[${role}]: ${msg.content}`;
    })
    .join('\n\n');
}
