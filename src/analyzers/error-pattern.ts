/**
 * Error Pattern Detector
 *
 * Analyzes error patterns in coding sessions to identify:
 * - Tool error rates (which tools fail most often)
 * - Repeated error messages (common failure modes)
 * - Recovery patterns (what actions follow errors)
 *
 * Helps identify recurring issues and inefficient error recovery workflows.
 */

import type { Message, Session, ErrorPatternMetadata } from '../core/types';
import { ProgrammaticPatternAnalyzer } from './base';

interface ToolErrorStats {
  toolName: string;
  totalCalls: number;
  errorCount: number;
  errorMessages: string[];
}

/**
 * Analyzer for error patterns in tool usage.
 *
 * Extracts observations about:
 * - Tools with high failure rates (e.g., "bash fails 40% of the time")
 * - Repeated error messages (e.g., "frequently encounters file not found errors")
 * - Recovery workflows (e.g., "after bash errors, typically retries with read first")
 */
export class ErrorPatternDetector extends ProgrammaticPatternAnalyzer {
  name = 'error-pattern';

  /** Minimum error count to report a tool's error rate */
  private readonly MIN_ERROR_COUNT = 2;

  /** Minimum error rate (ratio) to consider a tool problematic */
  private readonly MIN_ERROR_RATE = 0.2;

  /** Minimum occurrences for a repeated error message to be reported */
  private readonly MIN_MESSAGE_FREQUENCY = 2;

  /** Maximum length of error message snippets in observations */
  private readonly MAX_MESSAGE_LENGTH = 100;

  async analyze(session: Session, messages: Message[]): Promise<import('../core/types').Observation[]> {
    const observations: import('../core/types').Observation[] = [];

    const toolErrorStats = this.extractErrorStats(messages);
    const errorMessageFrequencies = this.extractErrorMessageFrequencies(messages);
    const recoveryPatterns = this.extractRecoveryPatterns(messages);

    observations.push(...this.analyzeToolErrorRates(toolErrorStats, session.id));
    observations.push(...this.analyzeRepeatedErrors(errorMessageFrequencies, session.id));
    observations.push(...this.analyzeRecoveryPatterns(recoveryPatterns, toolErrorStats, session.id));

    return observations;
  }

  /**
   * Extract per-tool error statistics from messages.
   */
  private extractErrorStats(messages: Message[]): Map<string, ToolErrorStats> {
    const stats = new Map<string, ToolErrorStats>();

    for (const message of messages) {
      if (!message.toolUses || message.toolUses.length === 0) {
        continue;
      }

      for (const toolUse of message.toolUses) {
        let stat = stats.get(toolUse.name);
        if (!stat) {
          stat = {
            toolName: toolUse.name,
            totalCalls: 0,
            errorCount: 0,
            errorMessages: [],
          };
          stats.set(toolUse.name, stat);
        }

        stat.totalCalls += 1;

        if (toolUse.success === false) {
          stat.errorCount += 1;
          if (toolUse.result) {
            stat.errorMessages.push(toolUse.result);
          }
        }
      }
    }

    return stats;
  }

  /**
   * Extract frequency of error message patterns.
   * Normalizes messages by truncating and trimming to find recurring patterns.
   */
  private extractErrorMessageFrequencies(messages: Message[]): Map<string, number> {
    const frequencies = new Map<string, number>();

    for (const message of messages) {
      if (!message.toolUses || message.toolUses.length === 0) {
        continue;
      }

      for (const toolUse of message.toolUses) {
        if (toolUse.success === false && toolUse.result) {
          const normalized = this.normalizeErrorMessage(toolUse.result);
          if (normalized) {
            frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
          }
        }
      }
    }

    return frequencies;
  }

  /**
   * Extract recovery patterns — what tools are used after a failed tool call.
   * Maps: failedToolName -> [nextToolNames]
   */
  private extractRecoveryPatterns(messages: Message[]): Map<string, string[]> {
    const recoveryMap = new Map<string, string[]>();

    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];

      if (!current || !current.toolUses || current.toolUses.length === 0) {
        continue;
      }

      if (!next || !next.toolUses || next.toolUses.length === 0) {
        continue;
      }

      // Check if any tool in current message failed
      for (const toolUse of current.toolUses) {
        if (toolUse.success === false) {
          const nextTool = next.toolUses[0];
          if (nextTool) {
            const recoveryTools = recoveryMap.get(toolUse.name) || [];
            recoveryTools.push(nextTool.name);
            recoveryMap.set(toolUse.name, recoveryTools);
          }
        }
      }
    }

    return recoveryMap;
  }

  /**
   * Create observations for tools with high error rates.
   */
  private analyzeToolErrorRates(
    stats: Map<string, ToolErrorStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const [toolName, stat] of stats) {
      if (stat.errorCount < this.MIN_ERROR_COUNT) {
        continue;
      }

      const errorRate = stat.totalCalls > 0 ? stat.errorCount / stat.totalCalls : 0;
      if (errorRate <= this.MIN_ERROR_RATE) {
        continue;
      }

      const ratePercent = Math.round(errorRate * 100);
      const text = `Tool "${toolName}" fails ${ratePercent}% of the time (${stat.errorCount}/${stat.totalCalls} calls)`;

      const commonMessage = this.getMostCommonMessage(stat.errorMessages);
      const metadata: ErrorPatternMetadata = {
        toolName,
        errorCount: stat.errorCount,
        totalCalls: stat.totalCalls,
        errorRate,
        ...(commonMessage ? { commonErrorMessage: commonMessage } : {}),
      };

      observations.push(
        this.createObservation(text, 'pattern', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Create observations for frequently repeated error messages.
   */
  private analyzeRepeatedErrors(
    frequencies: Map<string, number>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const [message, count] of frequencies) {
      if (count < this.MIN_MESSAGE_FREQUENCY) {
        continue;
      }

      const text = `Recurring error (${count}x): "${message}"`;
      const metadata: ErrorPatternMetadata = {
        toolName: 'unknown',
        errorCount: count,
        totalCalls: count,
        errorRate: 1.0,
        commonErrorMessage: message,
      };

      observations.push(
        this.createObservation(text, 'pattern', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Create observations for recovery patterns after errors.
   */
  private analyzeRecoveryPatterns(
    recoveryMap: Map<string, string[]>,
    toolStats: Map<string, ToolErrorStats>,
    sessionId: string
  ): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const [failedTool, recoveryTools] of recoveryMap) {
      if (recoveryTools.length < this.MIN_ERROR_COUNT) {
        continue;
      }

      // Count recovery tool frequencies
      const toolCounts = new Map<string, number>();
      for (const tool of recoveryTools) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }

      // Find dominant recovery tool
      let dominantTool: string | null = null;
      let dominantCount = 0;
      for (const [tool, count] of toolCounts) {
        if (count > dominantCount) {
          dominantTool = tool;
          dominantCount = count;
        }
      }

      if (!dominantTool) {
        continue;
      }

      // Only report if the dominant recovery tool appears frequently enough
      if (dominantCount < this.MIN_ERROR_COUNT) {
        continue;
      }

      const stat = toolStats.get(failedTool);
      const text = `After "${failedTool}" errors, typically uses "${dominantTool}" to recover (${dominantCount} times)`;
      const metadata: ErrorPatternMetadata = {
        toolName: failedTool,
        errorCount: stat?.errorCount || recoveryTools.length,
        totalCalls: stat?.totalCalls || recoveryTools.length,
        errorRate: stat ? stat.errorCount / stat.totalCalls : 1.0,
        recoveryTools: Array.from(toolCounts.keys()),
      };

      observations.push(
        this.createObservation(text, 'workflow', sessionId, metadata)
      );
    }

    return observations;
  }

  /**
   * Normalize an error message for frequency counting.
   * Truncates to MAX_MESSAGE_LENGTH and trims whitespace.
   */
  private normalizeErrorMessage(message: string): string {
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return '';
    }
    return trimmed.substring(0, this.MAX_MESSAGE_LENGTH);
  }

  /**
   * Get the most common error message from a list.
   */
  private getMostCommonMessage(messages: string[]): string | undefined {
    if (messages.length === 0) {
      return undefined;
    }

    const counts = new Map<string, number>();
    for (const msg of messages) {
      const normalized = this.normalizeErrorMessage(msg);
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }

    let mostCommon: string | undefined;
    let maxCount = 0;
    for (const [msg, count] of counts) {
      if (count > maxCount) {
        mostCommon = msg;
        maxCount = count;
      }
    }

    return mostCommon;
  }
}
