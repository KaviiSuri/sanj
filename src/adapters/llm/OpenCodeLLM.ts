/**
 * OpenCode LLM Adapter implementation.
 *
 * This adapter executes the OpenCode LLM to analyze session content and extract
 * recurring patterns, preferences, and workflow insights.
 *
 * Implements LLMAdapter interface using OpenCode CLI with zai-coding-plan/glm-4.7 model.
 */

import type { LLMAdapter } from './LLMAdapter';
import type { Session, Observation } from '../../core/types';
import { SanjError, ErrorCode } from '../../core/types';

/**
 * OpenCode LLM adapter implementation.
 *
 * Uses OpenCode CLI with default model: zai-coding-plan/glm-4.7
 */
export class OpenCodeLLMAdapter implements LLMAdapter {
  /** Adapter name */
  name: string;

  /** LLM model identifier */
  model: string;

  /** Cache availability check */
  private _available?: boolean;

  /**
   * Create OpenCodeLLMAdapter instance.
   *
   * @param model - Optional model override. Defaults to "zai-coding-plan/glm-4.7"
   */
  constructor(model?: string) {
    this.name = 'opencode-llm';
    this.model = model || 'zai-coding-plan/glm-4.7';
  }

  /**
   * Check if OpenCode CLI is available and executable on the system.
   *
   * @returns true if OpenCode CLI is available, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    if (this._available !== undefined) {
      return this._available;
    }

    try {
      const proc = Bun.spawn(['which', 'opencode'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await proc.exited;
      this._available = exitCode === 0;
      return this._available;
    } catch {
      this._available = false;
      return false;
    }
  }

  /**
   * Analyze a single session and extract recurring patterns, preferences, and insights.
   *
   * @param session - Session object containing session metadata and content
   * @returns Array of Observation objects
   *
   * Process:
   * 1. Construct LLM prompt asking for pattern analysis
   * 2. Execute OpenCode CLI with the prompt
   * 3. Parse JSON response from LLM
   * 4. Transform to Observation objects with proper metadata
   *
   * Error handling:
   * - Returns empty array on LLM failure (graceful degradation)
   * - Logs errors but doesn't crash analysis flow
   */
  async extractPatterns(session: Session): Promise<Observation[]> {
    if (!(await this.isAvailable())) {
      throw new SanjError(
        'OpenCode is not available',
        ErrorCode.LLM_CALL_FAILED,
        { adapter: this.name }
      );
    }

    try {
      const prompt = this.buildExtractionPrompt(session);
      // Use session file's directory as cwd so OpenCode can read the file
      const cwd = session.path.substring(0, session.path.lastIndexOf('/'));
      const response = await this.callOpenCode(prompt, cwd);

      if (!response) {
        return [];
      }

      const observations = this.parseLLMResponse(response, session);
      return observations;
    } catch (error) {
      if (error instanceof SanjError) {
        throw error;
      }

      throw new SanjError(
        `Failed to extract patterns from session ${session.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.LLM_CALL_FAILED,
        { sessionId: session.id, adapter: this.name }
      );
    }
  }

  /**
   * Check if two observations are semantically similar.
   *
   * @param observationA - First Observation to compare
   * @param observationB - Second Observation to compare
   * @returns true if observations are semantically similar (same pattern), false otherwise
   *
   * Process:
   * 1. Construct LLM prompt asking for similarity comparison
   * 2. Call OpenCode CLI with the prompt
   * 3. Parse response to determine similarity
   *
   * Error handling:
   * - Returns false on LLM failure (conservative - prefer separate observations)
   * - Logs failures for debugging
   */
  async checkSimilarity(
    observationA: Observation,
    observationB: Observation
  ): Promise<boolean> {
    if (!(await this.isAvailable())) {
      return false;
    }

    try {
      const prompt = this.buildSimilarityPrompt(observationA, observationB);
      const response = await this.callOpenCode(prompt);

      if (!response) {
        return false;
      }

      return this.parseSimilarityResponse(response);
    } catch {
      return false;
    }
  }

  /**
   * Build LLM prompt for similarity checking.
   *
   * @param observationA - First observation to compare
   * @param observationB - Second observation to compare
   * @returns Formatted prompt string
   */
  private buildSimilarityPrompt(
    observationA: Observation,
    observationB: Observation
  ): string {
    return `You are comparing two observations about coding patterns and preferences.

Observation A: ${observationA.text}
Category: ${observationA.category}

Observation B: ${observationB.text}
Category: ${observationB.category}

Are these observations describing the same or very similar patterns?
Respond with ONLY "YES" or "NO".`;
  }

  /**
   * Parse LLM response to determine similarity.
   *
   * @param response - Raw LLM response string
   * @returns true if similar, false otherwise
   */
  private parseSimilarityResponse(response: string): boolean {
    const trimmed = response.trim().toUpperCase();

    if (trimmed === 'YES' || trimmed.startsWith('YES')) {
      return true;
    }

    if (trimmed === 'NO' || trimmed.startsWith('NO')) {
      return false;
    }

    return false;
  }

  /**
   * Build LLM prompt for pattern extraction.
   *
   * @param session - Session to analyze
   * @returns Formatted prompt string
   */
  private buildExtractionPrompt(session: Session): string {
    return `Read the file at: ${session.path}

This file is a JSONL log of ONE coding assistant conversation. Analyze it and extract observations about the user's preferences, patterns, and habits.

Categories:
- preference: Language/tool choices (e.g., "prefers TypeScript")
- pattern: Repeated behaviors (e.g., "runs git status first")
- workflow: How they work (e.g., "tests before committing")
- tool-choice: Tools used (e.g., "uses Bun instead of npm")
- style: Coding style (e.g., "prefers functional programming")

RESPOND WITH ONLY A JSON ARRAY. NO OTHER TEXT.

Example: [{"text": "uses TypeScript", "category": "preference", "confidence": 0.8}]

Return [] if nothing notable found.`;
  }

  /**
   * Call OpenCode CLI with the given prompt.
   *
   * @param prompt - Prompt string to send to LLM
   * @param cwd - Optional working directory for the OpenCode process
   * @returns LLM response string, or null if failed
   */
  private async callOpenCode(prompt: string, cwd?: string): Promise<string | null> {
    try {
      const proc = Bun.spawn(['opencode', 'run', '--model', this.model, prompt], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: cwd,
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        throw new Error(`OpenCode CLI failed: ${stderr}`);
      }

      return stdout.trim();
    } catch (error) {
      throw new Error(`Failed to call OpenCode: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse LLM response and transform to Observation objects.
   *
   * @param response - Raw LLM response string
   * @param session - Session that was analyzed
   * @returns Array of Observation objects
   */
  private parseLLMResponse(response: string, session: Session): Observation[] {
    try {
      // Try to extract JSON array from response (in case LLM added extra text)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;

      console.log(`[OpenCodeLLM] Raw response (first 500 chars): ${response.substring(0, 500)}`);

      const data = JSON.parse(jsonStr);

      if (!Array.isArray(data)) {
        console.log(`[OpenCodeLLM] Response is not an array`);
        return [];
      }

      return data
        .map((item) => this.createObservation(item, session))
        .filter((obs): obs is Observation => obs !== null);
    } catch (error) {
      console.log(`[OpenCodeLLM] Failed to parse response: ${error instanceof Error ? error.message : 'Unknown'}`);
      return [];
    }
  }

  /**
   * Create an Observation from LLM response item.
   *
   * @param item - Parsed item from LLM response
   * @param session - Session that was analyzed
   * @returns Observation object or null if invalid
   */
  private createObservation(
    item: unknown,
    session: Session
  ): Observation | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const obj = item as Record<string, unknown>;

    if (typeof obj.text !== 'string' || !obj.text.trim()) {
      return null;
    }

    const categories = ['preference', 'pattern', 'workflow', 'tool-choice', 'style', 'other'];
    const category = typeof obj.category === 'string' && categories.includes(obj.category)
      ? (obj.category as Observation['category'])
      : 'other';

    const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.6;

    if (confidence < 0.6) {
      return null;
    }

    const now = new Date();

    return {
      id: crypto.randomUUID(),
      text: obj.text.trim(),
      category,
      count: 1,
      status: 'pending',
      sourceSessionIds: [session.id],
      firstSeen: now,
      lastSeen: now,
    };
  }
}
