/**
 * Analyzer infrastructure for programmatic pattern detection.
 *
 * This module provides the base infrastructure for all pattern analyzers
 * that detect patterns from session data programmatically (vs LLM-based detection).
 *
 * Analyzers operate independently and can be composed together
 * in the AnalysisEngine to provide comprehensive pattern extraction.
 */

import type { Message, Observation, Session } from '../core/types';

/**
 * Interface for pattern analyzers.
 *
 * All analyzers implement this interface to ensure consistent
 * integration with the AnalysisEngine.
 */
export interface PatternAnalyzer {
  /** Unique name for this analyzer */
  name: string;

  /**
   * Analyze a session and extract observations.
   *
   * @param session - The session to analyze
   * @param messages - Parsed messages from the session
   * @returns Array of observations extracted from the session
   */
  analyze(session: Session, messages: Message[]): Promise<Observation[]>;
}

/**
 * Base class for programmatic pattern analyzers.
 *
 * Provides common functionality for analyzers that detect patterns
 * through code rather than LLM inference.
 *
 * @example
 * ```typescript
 * class MyAnalyzer extends ProgrammaticPatternAnalyzer {
 *   name = 'my-analyzer';
 *
 *   async analyze(session: Session, messages: Message[]): Promise<Observation[]> {
 *     // Implementation here
 *   }
 * }
 * ```
 */
export abstract class ProgrammaticPatternAnalyzer implements PatternAnalyzer {
  /**
   * Must be implemented by subclasses to provide analyzer name
   */
  abstract name: string;

  /**
   * Analyze a session and extract observations.
   *
   * Must be implemented by subclasses.
   *
   * @param session - The session to analyze
   * @param messages - Parsed messages from the session
   * @returns Array of observations extracted from the session
   */
  abstract analyze(session: Session, messages: Message[]): Promise<Observation[]>;

  /**
   * Helper method to create an observation with default values.
   *
   * @param text - Observation text
   * @param category - Observation category
   * @param sessionId - Source session ID
   * @returns Observation object
   */
  protected createObservation(
    text: string,
    category: 'preference' | 'pattern' | 'workflow' | 'tool-choice' | 'style' | 'other',
    sessionId: string,
    metadata?: Record<string, unknown>
  ): Observation {
    const now = new Date();
    return {
      id: crypto.randomUUID(),
      text,
      category,
      count: 1,
      status: 'pending',
      sourceSessionIds: [sessionId],
      firstSeen: now,
      lastSeen: now,
      metadata,
    };
  }
}
