/**
 * Tool Usage Analyzer
 *
 * Analyzes tool usage patterns in coding sessions to identify:
 * - Tool frequency (how often each tool is used)
 * - Tool sequences (common patterns like Read → Edit → Bash)
 * - Parameter usage patterns (common inputs to tools)
 *
 * This helps identify user preferences for tool interactions and workflow patterns.
 */

import type { Message, Session, ToolUsageMetadata } from '../core/types';
import { ProgrammaticPatternAnalyzer } from './base';

interface ToolUsageStats {
  toolName: string;
  frequency: number;
  parameters: Record<string, Map<unknown, number>>;
  successCount: number;
}

/**
 * Analyzer for tool usage patterns.
 *
 * Extracts observations about:
 * - Preferred tools (e.g., "prefers edit over read+write")
 * - Tool sequences (e.g., "commonly runs tests with bash after edits")
 * - Parameter patterns (e.g., "frequently specifies strict: true in ESLint")
 */
export class ToolUsageAnalyzer extends ProgrammaticPatternAnalyzer {
  name = 'tool-usage';

  private readonly MIN_FREQUENCY = 3;
  private readonly MIN_SEQUENCE_FREQUENCY = 2;

  async analyze(session: Session, messages: Message[]): Promise<import('../core/types').Observation[]> {
    const observations: import('../core/types').Observation[] = [];

    const toolStats = this.extractToolStats(messages);
    const sequences = this.extractSequences(messages);

    observations.push(...this.analyzeToolFrequency(toolStats, session.id));
    observations.push(...this.analyzeSequences(sequences, session.id));
    observations.push(...this.analyzeParameters(toolStats, session.id));

    return observations;
  }

  /**
   * Extract tool usage statistics from messages.
   */
  private extractToolStats(messages: Message[]): Map<string, ToolUsageStats> {
    const stats = new Map<string, ToolUsageStats>();

    for (const message of messages) {
      if (!message.toolUses || message.toolUses.length === 0) {
        continue;
      }

      for (const toolUse of message.toolUses) {
        let stat = stats.get(toolUse.name);
        if (!stat) {
          stat = {
            toolName: toolUse.name,
            frequency: 0,
            parameters: {},
            successCount: 0,
          };
          stats.set(toolUse.name, stat);
        }

        stat.frequency += 1;

        if (toolUse.success !== false) {
          stat.successCount += 1;
        }

        if (toolUse.input) {
          for (const [key, value] of Object.entries(toolUse.input)) {
            if (!stat.parameters[key]) {
              stat.parameters[key] = new Map();
            }
            const count = stat.parameters[key].get(value) || 0;
            stat.parameters[key].set(value, count + 1);
          }
        }
      }
    }

    return stats;
  }

  /**
   * Extract tool sequences from messages.
   */
  private extractSequences(messages: Message[]): Map<string, number> {
    const sequences = new Map<string, number>();

    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];

      if (!current.toolUses || current.toolUses.length === 0) {
        continue;
      }

      if (!next.toolUses || next.toolUses.length === 0) {
        continue;
      }

      const currentTool = current.toolUses[0];
      const nextTool = next.toolUses[0];

      if (!currentTool || !nextTool) {
        continue;
      }

      const seq = `${currentTool.name} → ${nextTool.name}`;
      sequences.set(seq, (sequences.get(seq) || 0) + 1);
    }

    return sequences;
  }

  /**
   * Analyze tool frequency and create observations.
   */
  private analyzeToolFrequency(
    stats: Map<string, ToolUsageStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const entry of Array.from(stats.entries())) {
      const [toolName, stat] = entry;
      if (stat.frequency < this.MIN_FREQUENCY) {
        continue;
      }

      const text = `Frequently uses ${toolName} tool (${stat.frequency} times)`;
      const metadata: ToolUsageMetadata = {
        toolName,
        frequency: stat.frequency,
      };

      observations.push(
        this.createObservation(text, 'tool-choice', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Analyze tool sequences and create observations.
   */
  private analyzeSequences(
    sequences: Map<string, number>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const entry of Array.from(sequences.entries())) {
      const [sequence, frequency] = entry;
      if (frequency < this.MIN_SEQUENCE_FREQUENCY) {
        continue;
      }

      const text = `Common workflow pattern: ${sequence} (${frequency} times)`;
      const metadata: ToolUsageMetadata = {
        toolName: 'workflow',
        frequency,
        typicalSequence: sequence.split(' → '),
      };

      observations.push(
        this.createObservation(text, 'workflow', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Analyze parameter usage patterns.
   */
  private analyzeParameters(
    stats: Map<string, ToolUsageStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const entry of Array.from(stats.entries())) {
      const [toolName, stat] = entry;
      if (stat.frequency < this.MIN_FREQUENCY) {
        continue;
      }

      const commonParams: Record<string, unknown> = {};

      for (const [paramName, valueCounts] of Object.entries(stat.parameters)) {
        const counts = valueCounts as Map<unknown, number>;

        for (const entry of Array.from(counts.entries())) {
          const [value, count] = entry;
          if (count >= this.MIN_FREQUENCY) {
            if (!commonParams[paramName]) {
              commonParams[paramName] = [];
            }
            (commonParams[paramName] as unknown[]).push(value);
            if ((commonParams[paramName] as unknown[]).length >= 3) {
              break;
            }
          }
        }
      }

      if (Object.keys(commonParams).length === 0) {
        continue;
      }

      const text = `Commonly uses ${toolName} with parameters: ${Object.keys(commonParams).join(', ')}`;
      const metadata: ToolUsageMetadata = {
        toolName,
        frequency: stat.frequency,
        commonParameters: commonParams,
      };

      observations.push(
        this.createObservation(text, 'pattern', sessionId, metadata)
      );
    }

    return observations;
  }
}
