/**
 * LLMAdapter interface for pattern extraction and similarity checking.
 *
 * This interface defines the contract for LLM integrations in Sanj.
 * It abstracts away the specific LLM provider (OpenCode, Claude Code, future providers)
 * and provides two core operations:
 *
 * 1. Pattern Extraction: Analyze a coding session to extract recurring patterns,
 *    preferences, and workflows
 * 2. Similarity Checking: Determine if two observations are semantically similar
 *    (used for deduplication)
 *
 * This interface enables pluggable LLM backends without changing the core
 * analysis logic.
 */

import type { Session, Observation } from '../../core/types';

/**
 * LLMAdapter interface for extracting patterns and checking similarity.
 *
 * Adapters must work in cron jobs with no user input and handle errors gracefully.
 */
export interface LLMAdapter {
  /**
   * Human-readable name for this adapter.
   *
   * Examples: "OpenCode (GLM-4.7)", "Claude Code (Claude 3.5 Sonnet)"
   */
  name: string;

  /**
   * Check if the adapter's LLM tool is available in the environment.
   *
   * Examples:
   * - OpenCodeLLMAdapter checks if `opencode` command exists in PATH
   * - ClaudeCodeLLMAdapter checks if `claude` command exists in PATH
   *
   * @returns true if the tool is available and callable, false otherwise
   * @throws Never (handles errors gracefully)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Extract patterns from a single coding session.
   *
   * @param session - A Session object containing:
   *   - id: string
   *   - tool: 'claude-code' | 'opencode'
   *   - projectSlug?: string
   *   - createdAt: Date
   *   - modifiedAt: Date
   *   - path: string
   *   - messageCount: number
   *
   * @returns Array of Observation objects:
   *   - id: string (UUID)
   *   - text: string (the observation text)
   *   - category: 'preference' | 'pattern' | 'workflow' | 'tool-choice' | 'style' | 'other'
   *   - count: number (frequency, defaults to 1)
   *   - status: 'pending' | 'approved' | 'denied' | 'promoted-to-long-term' | 'promoted-to-core'
   *   - sourceSessionIds: string[] (array of session IDs supporting this observation)
   *   - firstSeen: Date (session timestamp)
   *   - lastSeen: Date (session timestamp)
   *   - tags?: string[]
   *   - metadata?: Record<string, unknown>
   *
   * Behavior:
   * - Analyzes the session conversation to identify:
   *   - Coding style preferences (indentation, naming conventions, framework choices)
   *   - Recurring workflows (common commands, tool sequences)
   *   - Problem-solving patterns (debugging approach, code review habits)
   *   - Library/tool preferences (testing frameworks, linters, etc)
   * - Should extract 2-6 observations per session (configurable)
   * - Observation order should be by confidence (highest first)
   *
   * Error handling:
   * - Throws SanjError if extraction fails (LLM unavailable, timeout, etc)
   * - Never returns null or throws untyped errors
   *
   * Non-interactive:
   * - No prompts, no user input
   * - Suitable for cron jobs
   */
  extractPatterns(session: Session): Promise<Observation[]>;

  /**
   * Check if two observations are semantically similar.
   *
   * @param observationA - First Observation to compare
   * @param observationB - Second Observation to compare
   * @returns true if observations are semantically similar (should be deduplicated), false otherwise
   *
   * Behavior:
   * - Compares observation text, category, and reasoning
   * - Uses semantic understanding, not just string matching
   * - Examples:
   *   - "User prefers Prettier for formatting" and "Uses Prettier as default formatter" = similar
   *   - "Loves TypeScript" and "Prefers JavaScript" = distinct
   *   - "Uses async/await" and "Avoids callbacks" = distinct (different statements)
   * - Conservative: when in doubt, return false (prefer separate observations)
   *
   * Confidence:
   * - Similarity is binary (true/false), not a score
   * - If > 70% semantic match, return true
   * - If < 70%, return false
   *
   * Error handling:
   * - Throws SanjError if comparison fails
   * - Never returns null
   */
  checkSimilarity(
    observationA: Observation,
    observationB: Observation
  ): Promise<boolean>;
}

// Type exports for convenience
export type { Session, Observation };
