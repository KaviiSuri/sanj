/**
 * Pattern Aggregation Service
 *
 * Merges observations from multiple pattern analyzers, deduplicates
 * semantically similar patterns, and ranks them by significance.
 *
 * This service sits between the individual analyzers and the observation
 * store, ensuring that the final set of observations is clean, unique,
 * and ordered by relevance.
 *
 * @module services/pattern-aggregation
 */

import type { Observation } from '../core/types.ts';

/**
 * Scoring weights used to compute a significance score for each observation.
 * Higher weight = more impact on the final score.
 */
export interface ScoringWeights {
  /** Weight applied to normalized frequency (count) */
  frequency: number;
  /** Weight applied to recency (how recently last seen) */
  recency: number;
  /** Weight applied to session spread (unique source sessions) */
  sessionSpread: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  frequency: 0.5,
  recency: 0.3,
  sessionSpread: 0.2,
};

/**
 * Result of the aggregation process.
 */
export interface AggregationResult {
  /** Final ranked observations after deduplication */
  observations: RankedObservation[];

  /** Total observations received from all analyzers */
  totalInputs: number;

  /** Number of duplicates merged during deduplication */
  duplicatesMerged: number;

  /** Breakdown of inputs by analyzer name */
  analyzerBreakdown: Record<string, number>;
}

/**
 * An observation annotated with its computed significance score.
 */
export interface RankedObservation extends Observation {
  /** Computed significance score (0.0 to 1.0) */
  significanceScore: number;
}

/**
 * Configuration for the aggregation service.
 */
export interface AggregationConfig {
  /** Similarity threshold for deduplication (0.0–1.0). Observations with
   *  text similarity at or above this threshold are considered duplicates. */
  similarityThreshold?: number;
  /** Scoring weights for ranking. Defaults to DEFAULT_WEIGHTS. */
  scoringWeights?: ScoringWeights;
  /** Maximum number of observations to return. 0 means no limit. */
  maxResults?: number;
  /** Reference time for recency scoring. Defaults to now. */
  referenceTime?: Date;
}

/**
 * Normalize a string for comparison: lowercase, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Compute token-overlap similarity (Jaccard-style) between two strings.
 * Tokenizes on whitespace and punctuation boundaries.
 *
 * @returns Similarity score between 0.0 and 1.0
 */
function computeTextSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> => {
    const tokens = normalizeText(s)
      .split(/[\s,.:;!?()[\]{}"']+/)
      .filter((t) => t.length > 2);
    return new Set(tokens);
  };

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return intersection / union;
}

/**
 * Compute a recency score (0.0–1.0) based on how recently an observation
 * was last seen relative to the reference time.
 *
 * Uses exponential decay: score = exp(-lambda * daysSinceLastSeen)
 * With lambda = ln(2) / 7, the half-life is 7 days.
 *
 * @param lastSeen - When the observation was last seen
 * @param referenceTime - The current reference time
 * @returns Recency score from 0.0 (old) to 1.0 (just seen)
 */
function computeRecencyScore(lastSeen: Date, referenceTime: Date): number {
  const daysSince = Math.max(0, (referenceTime.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
  const lambda = Math.LN2 / 7; // half-life of 7 days
  return Math.exp(-lambda * daysSince);
}

/**
 * Compute session spread score (0.0–1.0).
 * More unique source sessions = higher spread score.
 * Uses sqrt scaling to moderate the impact of very large session counts.
 *
 * @param uniqueSessions - Number of unique source sessions
 * @param maxSessions - Maximum sessions seen across all observations (for normalization)
 * @returns Spread score from 0.0 to 1.0
 */
function computeSessionSpreadScore(uniqueSessions: number, maxSessions: number): number {
  if (maxSessions === 0) return 0.0;
  return Math.sqrt(uniqueSessions) / Math.sqrt(maxSessions);
}

/**
 * Pattern Aggregation Service.
 *
 * Responsibilities:
 * 1. Collect observations from multiple analyzer outputs
 * 2. Deduplicate semantically similar observations by merging them
 * 3. Score and rank the deduplicated set by significance
 * 4. Return ranked observations ready for storage
 *
 * @example
 * ```typescript
 * const service = new PatternAggregationService({
 *   similarityThreshold: 0.7,
 *   maxResults: 50,
 * });
 *
 * const result = await service.aggregate([
 *   { analyzer: 'tool-usage', observations: toolObs },
 *   { analyzer: 'error-pattern', observations: errorObs },
 * ]);
 * ```
 */
export class PatternAggregationService {
  private config: Required<AggregationConfig>;

  constructor(config: AggregationConfig = {}) {
    this.config = {
      similarityThreshold: config.similarityThreshold ?? 0.7,
      scoringWeights: config.scoringWeights ?? DEFAULT_WEIGHTS,
      maxResults: config.maxResults ?? 0,
      referenceTime: config.referenceTime ?? new Date(),
    };
  }

  /**
   * Aggregate observations from multiple analyzers.
   *
   * @param analyzerOutputs - Array of { analyzer name, observations } pairs
   * @returns Aggregation result with ranked, deduplicated observations
   */
  async aggregate(
    analyzerOutputs: Array<{ analyzer: string; observations: Observation[] }>
  ): Promise<AggregationResult> {
    // Track per-analyzer counts
    const analyzerBreakdown: Record<string, number> = {};
    const allObservations: Observation[] = [];

    for (const { analyzer, observations } of analyzerOutputs) {
      analyzerBreakdown[analyzer] = observations.length;
      allObservations.push(...observations);
    }

    const totalInputs = allObservations.length;

    // Deduplicate
    const { deduplicated, duplicatesMerged } = this.deduplicate(allObservations);

    // Score and rank
    const ranked = this.rankObservations(deduplicated);

    // Apply maxResults limit
    const final = this.config.maxResults > 0
      ? ranked.slice(0, this.config.maxResults)
      : ranked;

    return {
      observations: final,
      totalInputs,
      duplicatesMerged,
      analyzerBreakdown,
    };
  }

  /**
   * Deduplicate a list of observations by merging similar ones.
   *
   * Algorithm:
   * 1. Iterate observations in order
   * 2. For each observation, check text similarity against already-accepted observations
   * 3. If similarity >= threshold, merge into the existing observation (bump count, extend sources)
   * 4. Otherwise, add as new unique observation
   *
   * Merging combines: counts summed, sourceSessionIds unioned, lastSeen takes the later date.
   *
   * @param observations - Raw observations to deduplicate
   * @returns Deduplicated set and count of merges performed
   */
  deduplicate(
    observations: Observation[]
  ): { deduplicated: Observation[]; duplicatesMerged: number } {
    const accepted: Observation[] = [];
    let duplicatesMerged = 0;

    for (const obs of observations) {
      const match = this.findSimilarObservation(obs, accepted);
      if (match) {
        // Merge into existing
        match.count += obs.count;

        // Union of source session IDs
        const existingSet = new Set(match.sourceSessionIds);
        for (const sid of obs.sourceSessionIds) {
          if (!existingSet.has(sid)) {
            match.sourceSessionIds.push(sid);
            existingSet.add(sid);
          }
        }

        // Take the later lastSeen
        if (obs.lastSeen > match.lastSeen) {
          match.lastSeen = obs.lastSeen;
        }

        // Merge metadata if both have it
        if (obs.metadata && match.metadata) {
          match.metadata = { ...match.metadata, ...obs.metadata };
        } else if (obs.metadata && !match.metadata) {
          match.metadata = { ...obs.metadata };
        }

        // Merge tags
        if (obs.tags) {
          const tagSet = new Set(match.tags || []);
          for (const tag of obs.tags) tagSet.add(tag);
          match.tags = [...tagSet];
        }

        duplicatesMerged++;
      } else {
        // Deep copy to avoid mutation of original
        accepted.push({
          ...obs,
          sourceSessionIds: [...obs.sourceSessionIds],
          tags: obs.tags ? [...obs.tags] : undefined,
          metadata: obs.metadata ? { ...obs.metadata } : undefined,
        });
      }
    }

    return { deduplicated: accepted, duplicatesMerged };
  }

  /**
   * Find an existing observation that is semantically similar to the candidate.
   *
   * Checks similarity only within the same category (if both have categories).
   * Returns the first match above the similarity threshold.
   *
   * @param candidate - Observation to find a match for
   * @param pool - Pool of existing observations to compare against
   * @returns The matching observation, or null if no match found
   */
  findSimilarObservation(
    candidate: Observation,
    pool: Observation[]
  ): Observation | null {
    for (const existing of pool) {
      // Only compare within the same category when both have one
      if (candidate.category && existing.category && candidate.category !== existing.category) {
        continue;
      }

      const similarity = computeTextSimilarity(candidate.text, existing.text);
      if (similarity >= this.config.similarityThreshold) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Score and rank observations by significance.
   *
   * Significance = weighted sum of:
   * - Frequency score: normalized count relative to max count in the set
   * - Recency score: exponential decay based on lastSeen
   * - Session spread score: normalized unique session count
   *
   * Results are sorted descending by significance score.
   *
   * @param observations - Deduplicated observations to score
   * @returns Observations annotated with significanceScore, sorted descending
   */
  rankObservations(observations: Observation[]): RankedObservation[] {
    if (observations.length === 0) return [];

    const weights = this.config.scoringWeights;
    const referenceTime = this.config.referenceTime;

    // Compute normalization factors
    const maxCount = Math.max(...observations.map((o) => o.count), 1);
    const maxSessions = Math.max(
      ...observations.map((o) => o.sourceSessionIds.length),
      1
    );

    const ranked: RankedObservation[] = observations.map((obs) => {
      const freqScore = obs.count / maxCount;
      const recencyScore = computeRecencyScore(obs.lastSeen, referenceTime);
      const spreadScore = computeSessionSpreadScore(obs.sourceSessionIds.length, maxSessions);

      const significanceScore =
        weights.frequency * freqScore +
        weights.recency * recencyScore +
        weights.sessionSpread * spreadScore;

      return {
        ...obs,
        significanceScore: Math.min(1.0, Math.max(0.0, significanceScore)),
      };
    });

    // Sort descending by significance
    ranked.sort((a, b) => b.significanceScore - a.significanceScore);

    return ranked;
  }
}

// Export utility functions for testing
export { computeTextSimilarity, computeRecencyScore, computeSessionSpreadScore, normalizeText };
