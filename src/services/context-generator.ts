/**
 * Context Generator Service
 *
 * Transforms long-term memories into structured markdown sections suitable for
 * writing to CLAUDE.md or AGENTS.md as "core memory" context.  The output is
 * human-readable, category-grouped, and relevance-filtered so that only the
 * most significant observations make it into the final context files.
 *
 * Pipeline:
 * 1. Receive a batch of LongTermMemory objects and an optional target file
 * 2. Filter memories by a configurable relevance threshold (driven by
 *    observation count, recency, and session spread)
 * 3. Group surviving memories into category-specific sections
 * 4. Format each section as a structured markdown block
 * 5. Assemble sections into a complete document with a header and timestamp
 * 6. Return the final markdown alongside metadata about what was included
 *
 * The service is stateless — it receives memories and produces markdown on each
 * call.  Persistence and file I/O are the responsibility of the caller.
 *
 * @module services/context-generator
 */

import type { LongTermMemory, Observation } from '../core/types.ts';

// =============================================================================
// Exported Types
// =============================================================================

/**
 * Controls how the generator selects, limits, and formats output.
 */
export interface GeneratorConfig {
  /**
   * Minimum relevance score (0.0–1.0) an observation must reach to be
   * included in the generated context.  Higher values produce leaner output.
   */
  relevanceThreshold: number;

  /**
   * Maximum number of items to emit per category section.
   * 0 means no per-category limit.
   */
  maxItemsPerCategory: number;

  /**
   * Default target file when the caller does not specify one.
   */
  defaultTargetFile: 'CLAUDE.md' | 'AGENTS.md';
}

/**
 * A single memory formatted for inclusion in a context section.
 */
export interface ContextItem {
  /** The underlying observation text */
  text: string;

  /** How many times this pattern was observed */
  count: number;

  /** The observation category label */
  category: ObservationCategory;

  /** Computed relevance score used for filtering (0.0–1.0) */
  relevanceScore: number;

  /** Source long-term memory ID for traceability */
  sourceMemoryId: string;
}

/**
 * A category-specific section containing zero or more context items.
 */
export interface ContextSection {
  /** Human-readable section heading (e.g. "Preferences") */
  heading: string;

  /** The raw category key this section corresponds to */
  category: ObservationCategory;

  /** Items in this section, ordered by relevance descending */
  items: ContextItem[];
}

/**
 * The complete output of a context generation run.
 */
export interface GeneratedContext {
  /** The assembled markdown string ready for file insertion */
  markdown: string;

  /** Which file this context was generated for */
  targetFile: 'CLAUDE.md' | 'AGENTS.md';

  /** Category-level sections that were assembled (useful for diagnostics) */
  sections: ContextSection[];

  /** Total memories considered before filtering */
  totalMemoriesInput: number;

  /** Memories that survived the relevance filter */
  memoriesIncluded: number;

  /** Memories that were dropped by the relevance filter */
  memoriesFiltered: number;

  /** Rough estimated token count of the generated markdown */
  estimatedTokenCount: number;

  /** When this context was generated */
  generatedAt: Date;
}

// =============================================================================
// Internal Category Helpers
// =============================================================================

/**
 * The set of observation categories the generator understands.
 * Mirrors Observation.category but adds a concrete string union type for
 * exhaustive switch handling.
 */
type ObservationCategory = 'preference' | 'pattern' | 'workflow' | 'tool-choice' | 'style' | 'other';

/**
 * Map from raw category keys to human-readable section headings.
 */
const CATEGORY_HEADINGS: Record<ObservationCategory, string> = {
  'preference': 'Preferences',
  'pattern':    'Patterns',
  'workflow':   'Workflows',
  'tool-choice': 'Tool Choices',
  'style':      'Style Conventions',
  'other':      'Other Observations',
};

/**
 * Canonical ordering for categories in the output document.
 * Categories are rendered top-to-bottom in this order.  Any category not in
 * this list is appended at the end.
 */
const CATEGORY_ORDER: ObservationCategory[] = [
  'preference',
  'workflow',
  'tool-choice',
  'pattern',
  'style',
  'other',
];

/**
 * Default configuration values applied when the caller omits fields.
 */
const DEFAULT_CONFIG: GeneratorConfig = {
  relevanceThreshold: 0.3,
  maxItemsPerCategory: 10,
  defaultTargetFile: 'CLAUDE.md',
};

// =============================================================================
// Relevance Scoring
// =============================================================================

/**
 * Compute a relevance score (0.0–1.0) for an observation based on three
 * signals weighted equally:
 *
 * - **Frequency score**: normalised count relative to a provided maximum.
 *   An observation seen 10 times when the max is 10 scores 1.0.
 * - **Recency score**: exponential decay from lastSeen.  Half-life is 14 days,
 *   meaning an observation last seen 14 days ago scores ~0.5 on this axis.
 * - **Session spread score**: square-root-normalised count of unique source
 *   sessions relative to a provided maximum.  Encourages observations that
 *   appear across many sessions.
 *
 * The three component scores are combined as an unweighted average.
 *
 * @param observation   - The observation to score
 * @param maxCount      - Maximum observation count in the current set (for normalisation)
 * @param maxSessions   - Maximum session-spread count in the current set
 * @param referenceTime - Point-in-time used for recency decay
 * @returns Relevance score clamped to [0.0, 1.0]
 */
function computeRelevanceScore(
  observation: Observation,
  maxCount: number,
  maxSessions: number,
  referenceTime: Date
): number {
  // Frequency component
  const frequencyScore = maxCount > 0 ? observation.count / maxCount : 0.0;

  // Recency component (exponential decay, 14-day half-life)
  const daysSinceLastSeen = Math.max(
    0,
    (referenceTime.getTime() - observation.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
  );
  const lambda = Math.LN2 / 14;
  const recencyScore = Math.exp(-lambda * daysSinceLastSeen);

  // Session spread component (sqrt normalisation)
  const sessionCount = observation.sourceSessionIds.length;
  const spreadScore = maxSessions > 0
    ? Math.sqrt(sessionCount) / Math.sqrt(maxSessions)
    : 0.0;

  const raw = (frequencyScore + recencyScore + spreadScore) / 3;
  return Math.min(1.0, Math.max(0.0, raw));
}

// =============================================================================
// ContextGeneratorService
// =============================================================================

/**
 * Generates structured markdown context from long-term memories.
 *
 * The service sits at the end of the memory pipeline — after observations have
 * been extracted, aggregated, and promoted through the hierarchy — and produces
 * the text that will ultimately live in CLAUDE.md or AGENTS.md.
 *
 * @example
 * ```typescript
 * const generator = new ContextGeneratorService({
 *   relevanceThreshold: 0.4,
 *   maxItemsPerCategory: 8,
 *   defaultTargetFile: 'CLAUDE.md',
 * });
 *
 * const context = generator.generateContext(memories, 'CLAUDE.md');
 * console.log(context.markdown);
 * console.log(`Included ${context.memoriesIncluded} of ${context.totalMemoriesInput} memories`);
 * ```
 */
export class ContextGeneratorService {
  private readonly config: GeneratorConfig;

  /**
   * Create a ContextGeneratorService.
   *
   * @param config - Generator configuration.  Any omitted fields fall back to
   *                 sensible defaults (threshold 0.3, max 10 per category,
   *                 target CLAUDE.md).
   */
  constructor(config: Partial<GeneratorConfig> = {}) {
    this.config = {
      relevanceThreshold: config.relevanceThreshold ?? DEFAULT_CONFIG.relevanceThreshold,
      maxItemsPerCategory: config.maxItemsPerCategory ?? DEFAULT_CONFIG.maxItemsPerCategory,
      defaultTargetFile: config.defaultTargetFile ?? DEFAULT_CONFIG.defaultTargetFile,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Primary Entry Point
  // ---------------------------------------------------------------------------

  /**
   * Generate a complete context document from a set of long-term memories.
   *
   * Steps:
   * 1. Filter memories to only those meeting the relevance threshold
   * 2. Group the surviving memories by observation category
   * 3. Format each group as a markdown section
   * 4. Assemble all sections under a top-level header with a timestamp
   * 5. Estimate the token count of the final output
   *
   * @param memories   - Long-term memories to consider for inclusion
   * @param targetFile - Which file the context is destined for (defaults to config)
   * @returns Complete generated context with markdown and diagnostic metadata
   */
  generateContext(
    memories: LongTermMemory[],
    targetFile?: 'CLAUDE.md' | 'AGENTS.md'
  ): GeneratedContext {
    const resolvedTarget = targetFile ?? this.config.defaultTargetFile;
    const now = new Date();

    // Step 1: Relevance filtering
    const filtered = this.filterByRelevance(memories, this.config.relevanceThreshold);

    // Step 2: Group by category
    const grouped = this.groupByCategory(filtered);

    // Step 3: Format each category section
    const sections: ContextSection[] = [];
    for (const [category, items] of grouped) {
      const section = this.formatSection(category, items);
      if (section.items.length > 0) {
        sections.push(section);
      }
    }

    // Sort sections into canonical category order
    sections.sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a.category);
      const indexB = CATEGORY_ORDER.indexOf(b.category);
      // Categories not in the order list are pushed to the end
      const sortA = indexA === -1 ? CATEGORY_ORDER.length : indexA;
      const sortB = indexB === -1 ? CATEGORY_ORDER.length : indexB;
      return sortA - sortB;
    });

    // Step 4: Assemble the full document
    const markdown = this.formatFullContext(sections, resolvedTarget);

    // Step 5: Estimate tokens
    const estimatedTokenCount = this.estimateTokenCount(markdown);

    return {
      markdown,
      targetFile: resolvedTarget,
      sections,
      totalMemoriesInput: memories.length,
      memoriesIncluded: filtered.length,
      memoriesFiltered: memories.length - filtered.length,
      estimatedTokenCount,
      generatedAt: now,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Relevance Filtering
  // ---------------------------------------------------------------------------

  /**
   * Filter long-term memories to only those whose underlying observation
   * meets or exceeds the given relevance threshold.
   *
   * Relevance is computed per-observation using frequency, recency, and session
   * spread signals (see {@link computeRelevanceScore}).  The normalisation
   * denominators (max count, max sessions) are derived from the input set so
   * filtering is relative — a set of exclusively low-count observations will
   * still produce high-scoring items if they are recent and spread.
   *
   * @param memories  - Long-term memories to evaluate
   * @param threshold - Minimum relevance score (0.0–1.0) for inclusion
   * @returns Memories whose observations score at or above the threshold
   */
  filterByRelevance(
    memories: LongTermMemory[],
    threshold: number
  ): LongTermMemory[] {
    if (memories.length === 0) return [];

    const now = new Date();
    const observations = memories.map((m) => m.observation);

    // Compute normalisation denominators from the full input set
    const maxCount = Math.max(...observations.map((o) => o.count), 1);
    const maxSessions = Math.max(
      ...observations.map((o) => o.sourceSessionIds.length),
      1
    );

    return memories.filter((memory) => {
      const score = computeRelevanceScore(
        memory.observation,
        maxCount,
        maxSessions,
        now
      );
      return score >= threshold;
    });
  }

  // ---------------------------------------------------------------------------
  // Public API: Grouping
  // ---------------------------------------------------------------------------

  /**
   * Group long-term memories by their observation category.
   *
   * Memories whose observation has no explicit category are placed in the
   * {@code 'other'} bucket.  The returned map preserves insertion order
   * matching the order memories appear in the input array.
   *
   * @param memories - Long-term memories to group
   * @returns Ordered map from category to array of memories
   */
  groupByCategory(
    memories: LongTermMemory[]
  ): Map<ObservationCategory, LongTermMemory[]> {
    const groups = new Map<ObservationCategory, LongTermMemory[]>();

    for (const memory of memories) {
      const category: ObservationCategory = memory.observation.category ?? 'other';
      const bucket = groups.get(category);
      if (bucket) {
        bucket.push(memory);
      } else {
        groups.set(category, [memory]);
      }
    }

    return groups;
  }

  // ---------------------------------------------------------------------------
  // Public API: Section Formatting
  // ---------------------------------------------------------------------------

  /**
   * Format a single category section as a {@link ContextSection}.
   *
   * Items within the section are:
   * 1. Scored for relevance (using the same scoring used in filtering)
   * 2. Sorted descending by relevance score
   * 3. Truncated to {@link GeneratorConfig.maxItemsPerCategory} if configured
   *
   * @param category - The observation category for this section
   * @param memories - Memories belonging to this category
   * @returns A fully populated ContextSection
   */
  formatSection(
    category: ObservationCategory,
    memories: LongTermMemory[]
  ): ContextSection {
    const now = new Date();
    const observations = memories.map((m) => m.observation);

    const maxCount = Math.max(...observations.map((o) => o.count), 1);
    const maxSessions = Math.max(
      ...observations.map((o) => o.sourceSessionIds.length),
      1
    );

    // Build ContextItem array with scores
    let items: ContextItem[] = memories.map((memory) => {
      const obs = memory.observation;
      const score = computeRelevanceScore(obs, maxCount, maxSessions, now);

      return {
        text: obs.text,
        count: obs.count,
        category,
        relevanceScore: Math.min(1.0, Math.max(0.0, score)),
        sourceMemoryId: memory.id,
      };
    });

    // Sort by relevance descending
    items.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply per-category limit
    if (this.config.maxItemsPerCategory > 0) {
      items = items.slice(0, this.config.maxItemsPerCategory);
    }

    return {
      heading: CATEGORY_HEADINGS[category] ?? 'Other',
      category,
      items,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Full Document Assembly
  // ---------------------------------------------------------------------------

  /**
   * Assemble category sections into a complete markdown document.
   *
   * The document structure is:
   * ```
   * ## AI Assistant Patterns & Preferences
   * *Last updated: <ISO date>*
   *
   * ### <Section Heading>
   * - **<item text>** _(seen N times)_
   * ...
   * ```
   *
   * An empty sections array produces a minimal document with only the header
   * and an informational note that no memories were available.
   *
   * @param sections   - Ordered category sections to include
   * @param targetFile - Which target file this document is destined for
   * @returns The fully assembled markdown string
   */
  formatFullContext(
    sections: ContextSection[],
    targetFile: 'CLAUDE.md' | 'AGENTS.md'
  ): string {
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const lines: string[] = [];

    // Top-level header — include the target file as a subtle provenance note
    lines.push('## AI Assistant Patterns & Preferences');
    lines.push(`*Last updated: ${dateString} | Written to: ${targetFile}*`);
    lines.push('');

    if (sections.length === 0) {
      lines.push('*No memories available for context generation.*');
      return lines.join('\n') + '\n';
    }

    // Render each section
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Guard required by noUncheckedIndexedAccess; the loop bound guarantees
      // this is always defined, but the compiler cannot prove it statically.
      if (!section) continue;

      lines.push(`### ${section.heading}`);

      for (const item of section.items) {
        lines.push(`- **${item.text}** _(seen ${item.count} times)_`);
      }

      // Blank line between sections (but not after the last one)
      if (i < sections.length - 1) {
        lines.push('');
      }
    }

    // Trailing newline for clean file appends
    lines.push('');

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Public API: Token Estimation
  // ---------------------------------------------------------------------------

  /**
   * Produce a rough estimate of how many tokens the given markdown context
   * string will consume when read by an LLM.
   *
   * The heuristic assumes approximately 4 characters per token, which aligns
   * with empirical averages for English prose and light markdown.  This is
   * intentionally conservative (may over-count slightly) to help callers
   * budget safely within context windows.
   *
   * @param context - The markdown string to estimate
   * @returns Estimated token count (integer, rounded up)
   */
  estimateTokenCount(context: string): number {
    // ~4 characters per token is a widely-used approximation
    const CHARS_PER_TOKEN = 4;
    return Math.ceil(context.length / CHARS_PER_TOKEN);
  }
}
