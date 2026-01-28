/**
 * Workflow Sequence Detector
 *
 * Identifies common multi-step workflow patterns in coding sessions using
 * a sliding window approach over tool-use sequences. Detects patterns that
 * span 3+ actions (e.g., read → edit → bash for test-fix cycles, or
 * read → read → edit for research-then-implement workflows).
 *
 * Complements ToolUsageAnalyzer which only detects 2-step pairs.
 *
 * Key design decisions:
 * - Minimum sequence length of 3 avoids overlap with ToolUsageAnalyzer's pair detection.
 * - Sliding window extracts all sub-sequences of size 3..MAX_WINDOW_SIZE.
 * - Frequency threshold filters noise; only sequences seen 2+ times are reported.
 * - Loop detection identifies iterative patterns (A → B → A) common in test-fix cycles.
 */

import type { Message, Session } from '../core/types';
import { ProgrammaticPatternAnalyzer } from './base';

/** Minimum number of actions in a reported sequence */
const MIN_SEQUENCE_LENGTH = 3;

/** Maximum window size for sequence extraction */
const MAX_WINDOW_SIZE = 5;

/** Minimum times a sequence must appear to be reported */
const MIN_SEQUENCE_FREQUENCY = 2;

/** Minimum times a loop pattern must appear to be reported */
const MIN_LOOP_FREQUENCY = 2;

/**
 * Represents a detected workflow sequence with its frequency.
 */
interface SequenceRecord {
  /** Ordered list of tool names in the sequence */
  steps: string[];
  /** Number of times this exact sequence was observed */
  frequency: number;
}

/**
 * Represents a detected iterative loop pattern.
 */
interface LoopPattern {
  /** The repeating unit (e.g., ['bash', 'edit'] for a test-fix loop) */
  cycle: string[];
  /** Number of times the loop was observed */
  frequency: number;
  /** Full expanded sequence showing the loop in context */
  fullSequence: string[];
}

/**
 * Analyzer for multi-step workflow sequences.
 *
 * Extracts observations about:
 * - Common 3+ step workflows (e.g., "read → edit → bash" for edit-and-test)
 * - Iterative loop patterns (e.g., "bash → edit → bash" for test-fix-test cycles)
 * - Sequence frequency rankings to surface the most common workflows
 */
export class WorkflowSequenceDetector extends ProgrammaticPatternAnalyzer {
  name = 'workflow-sequence';

  async analyze(session: Session, messages: Message[]): Promise<import('../core/types').Observation[]> {
    const observations: import('../core/types').Observation[] = [];

    // Extract the ordered tool-use chain from messages
    const toolChain = this.extractToolChain(messages);

    if (toolChain.length < MIN_SEQUENCE_LENGTH) {
      return observations;
    }

    // Detect multi-step sequences via sliding window
    const sequences = this.extractSequences(toolChain);

    // Detect iterative loop patterns
    const loops = this.detectLoops(toolChain);

    // Create observations from frequent sequences
    observations.push(...this.analyzeSequences(sequences, session.id));

    // Create observations from loop patterns
    observations.push(...this.analyzeLoops(loops, session.id));

    return observations;
  }

  /**
   * Extract an ordered chain of tool names from messages.
   *
   * Only includes messages that contain tool uses. Each tool use
   * in a message contributes one entry to the chain (in order).
   */
  private extractToolChain(messages: Message[]): string[] {
    const chain: string[] = [];

    for (const message of messages) {
      if (!message.toolUses || message.toolUses.length === 0) {
        continue;
      }

      for (const toolUse of message.toolUses) {
        chain.push(toolUse.name);
      }
    }

    return chain;
  }

  /**
   * Extract all sub-sequences of length MIN_SEQUENCE_LENGTH..MAX_WINDOW_SIZE
   * using a sliding window over the tool chain.
   *
   * For a chain [A, B, C, D, E] with window sizes 3-4:
   * - Size 3: [A,B,C], [B,C,D], [C,D,E]
   * - Size 4: [A,B,C,D], [B,C,D,E]
   *
   * Returns only sequences that meet MIN_SEQUENCE_FREQUENCY.
   */
  private extractSequences(toolChain: string[]): SequenceRecord[] {
    const frequencyMap = new Map<string, { steps: string[]; count: number }>();

    for (let windowSize = MIN_SEQUENCE_LENGTH; windowSize <= Math.min(MAX_WINDOW_SIZE, toolChain.length); windowSize++) {
      for (let i = 0; i <= toolChain.length - windowSize; i++) {
        const subsequence = toolChain.slice(i, i + windowSize);
        const key = subsequence.join(' → ');

        const existing = frequencyMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          frequencyMap.set(key, { steps: subsequence, count: 1 });
        }
      }
    }

    // Filter to sequences meeting frequency threshold and deduplicate
    // (a 4-step sequence that appears 2x implies its 3-step sub-windows appear 3x;
    // only keep sequences where the longer variant is not strictly subsumed)
    const candidates = Array.from(frequencyMap.values())
      .filter((record) => record.count >= MIN_SEQUENCE_FREQUENCY)
      .map((record): SequenceRecord => ({
        steps: record.steps,
        frequency: record.count,
      }));

    return this.deduplicateSequences(candidates);
  }

  /**
   * Remove sequences that are strict sub-sequences of longer reported sequences
   * with equal or higher frequency. This prevents noise from reporting both
   * [A, B, C] and [A, B, C, D] when the shorter is always part of the longer.
   */
  private deduplicateSequences(candidates: SequenceRecord[]): SequenceRecord[] {
    // Sort by length descending so we check longer sequences first
    const sorted = [...candidates].sort((a, b) => b.steps.length - a.steps.length);
    const kept: SequenceRecord[] = [];

    for (const candidate of sorted) {
      const isSubsumed = kept.some((longer) => {
        if (longer.steps.length <= candidate.steps.length) {
          return false;
        }
        // Check if candidate's steps appear as a contiguous sub-array in longer
        if (longer.frequency >= candidate.frequency) {
          return this.isContiguousSubsequence(candidate.steps, longer.steps);
        }
        return false;
      });

      if (!isSubsumed) {
        kept.push(candidate);
      }
    }

    return kept;
  }

  /**
   * Check if `sub` appears as a contiguous sub-array within `full`.
   */
  private isContiguousSubsequence(sub: string[], full: string[]): boolean {
    if (sub.length > full.length) {
      return false;
    }

    for (let i = 0; i <= full.length - sub.length; i++) {
      let match = true;
      for (let j = 0; j < sub.length; j++) {
        if (full[i + j] !== sub[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect iterative loop patterns in the tool chain.
   *
   * A loop is defined as a repeating cycle of 2-3 tools. For example:
   * - [bash, edit, bash, edit] contains loop [bash, edit] with frequency 2
   * - [bash, edit, bash] contains loop [bash, edit] detected once (partial)
   *
   * Uses the approach of scanning for A → B → A patterns (period-2 loops)
   * and A → B → C → A patterns (period-3 loops).
   */
  private detectLoops(toolChain: string[]): LoopPattern[] {
    const loops: LoopPattern[] = [];

    // Detect period-2 loops: A → B → A → B ...
    loops.push(...this.detectPeriodicLoops(toolChain, 2));

    // Detect period-3 loops: A → B → C → A → B → C ...
    loops.push(...this.detectPeriodicLoops(toolChain, 3));

    return loops;
  }

  /**
   * Detect loops with a given period length.
   *
   * Scans the tool chain looking for positions where a cycle of `period`
   * tools repeats at least MIN_LOOP_FREQUENCY times.
   */
  private detectPeriodicLoops(toolChain: string[], period: number): LoopPattern[] {
    const loopMap = new Map<string, { cycle: string[]; frequency: number; fullSequence: string[] }>();

    for (let i = 0; i <= toolChain.length - period * MIN_LOOP_FREQUENCY; i++) {
      const candidateCycle = toolChain.slice(i, i + period);

      // Count consecutive repetitions of this cycle starting at position i
      let repetitions = 1;
      let endIndex = i + period;

      while (endIndex + period <= toolChain.length) {
        const nextWindow = toolChain.slice(endIndex, endIndex + period);
        const matches = candidateCycle.every((tool, idx) => tool === nextWindow[idx]);
        if (matches) {
          repetitions += 1;
          endIndex += period;
        } else {
          break;
        }
      }

      if (repetitions >= MIN_LOOP_FREQUENCY) {
        const key = candidateCycle.join(' → ');
        const existing = loopMap.get(key);

        if (!existing || repetitions > existing.frequency) {
          loopMap.set(key, {
            cycle: candidateCycle,
            frequency: repetitions,
            fullSequence: toolChain.slice(i, endIndex),
          });
        }
      }
    }

    return Array.from(loopMap.values());
  }

  /**
   * Create observations for frequent multi-step sequences.
   */
  private analyzeSequences(sequences: SequenceRecord[], sessionId: string): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    // Sort by frequency descending to surface most common workflows first
    const sorted = [...sequences].sort((a, b) => b.frequency - a.frequency);

    for (const seq of sorted) {
      const stepsStr = seq.steps.join(' → ');
      const text = `Workflow pattern: ${stepsStr} (${seq.frequency} times)`;

      observations.push(
        this.createObservation(text, 'workflow', sessionId, {
          sequenceSteps: seq.steps,
          sequenceLength: seq.steps.length,
          frequency: seq.frequency,
        })
      );
    }

    return observations;
  }

  /**
   * Create observations for detected iterative loop patterns.
   */
  private analyzeLoops(loops: LoopPattern[], sessionId: string): import('../core/types').Observation[] {
    const observations: import('../core/types').Observation[] = [];

    for (const loop of loops) {
      const cycleStr = loop.cycle.join(' → ');
      const text = `Iterative loop detected: [${cycleStr}] repeated ${loop.frequency} times`;

      observations.push(
        this.createObservation(text, 'workflow', sessionId, {
          loopCycle: loop.cycle,
          loopFrequency: loop.frequency,
          fullSequence: loop.fullSequence,
        })
      );
    }

    return observations;
  }
}
