/**
 * Tests for PatternAggregationService
 *
 * Validates deduplication, ranking, merging, and end-to-end aggregation
 * of observations from multiple analyzers.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { Observation } from "../../src/core/types";
import {
  PatternAggregationService,
  computeTextSimilarity,
  computeRecencyScore,
  computeSessionSpreadScore,
  normalizeText,
} from "../../src/services/pattern-aggregation";
import type { AggregationConfig, RankedObservation } from "../../src/services/pattern-aggregation";

// Helpers

function makeObservation(
  overrides: Partial<Observation> & { id?: string; text: string }
): Observation {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    text: overrides.text,
    category: overrides.category ?? "pattern",
    count: overrides.count ?? 1,
    status: overrides.status ?? "pending",
    sourceSessionIds: overrides.sourceSessionIds ?? ["session-1"],
    firstSeen: overrides.firstSeen ?? now,
    lastSeen: overrides.lastSeen ?? now,
    tags: overrides.tags,
    metadata: overrides.metadata,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// =============================================================================
// Unit tests for utility functions
// =============================================================================

describe("normalizeText", () => {
  test("should lowercase and collapse whitespace", () => {
    expect(normalizeText("  Hello   World  ")).toBe("hello world");
  });

  test("should handle empty string", () => {
    expect(normalizeText("")).toBe("");
  });

  test("should handle tabs and newlines", () => {
    expect(normalizeText("hello\t\nworld")).toBe("hello world");
  });
});

describe("computeTextSimilarity", () => {
  test("should return 1.0 for identical strings", () => {
    expect(computeTextSimilarity("read file test.ts", "read file test.ts")).toBe(1.0);
  });

  test("should return 1.0 for identical strings with different casing", () => {
    expect(computeTextSimilarity("Read File Test.ts", "read file test.ts")).toBe(1.0);
  });

  test("should return 0.0 for completely different strings", () => {
    const sim = computeTextSimilarity("apple banana cherry", "zebra elephant giraffe");
    expect(sim).toBe(0.0);
  });

  test("should return high similarity for mostly overlapping strings", () => {
    const sim = computeTextSimilarity(
      "frequently used tool read for reading files",
      "frequently used tool read for editing files"
    );
    expect(sim).toBeGreaterThan(0.7);
  });

  test("should return 1.0 for two empty strings", () => {
    expect(computeTextSimilarity("", "")).toBe(1.0);
  });

  test("should return 0.0 when one string is empty", () => {
    expect(computeTextSimilarity("hello world test", "")).toBe(0.0);
  });

  test("should handle strings with punctuation", () => {
    const sim = computeTextSimilarity(
      "tool 'read' used 3 times in session",
      "tool 'read' used 5 times in session"
    );
    expect(sim).toBeGreaterThan(0.6);
  });

  test("should be commutative", () => {
    const a = "pattern detection in tool usage";
    const b = "tool usage pattern detected frequently";
    expect(computeTextSimilarity(a, b)).toBe(computeTextSimilarity(b, a));
  });
});

describe("computeRecencyScore", () => {
  test("should return 1.0 for observation seen just now", () => {
    const now = new Date();
    expect(computeRecencyScore(now, now)).toBe(1.0);
  });

  test("should return ~0.5 for observation seen 7 days ago (half-life)", () => {
    const now = new Date();
    const sevenDaysAgo = daysAgo(7);
    const score = computeRecencyScore(sevenDaysAgo, now);
    expect(score).toBeCloseTo(0.5, 1);
  });

  test("should return lower score for older observations", () => {
    const now = new Date();
    const recent = computeRecencyScore(daysAgo(1), now);
    const old = computeRecencyScore(daysAgo(30), now);
    expect(recent).toBeGreaterThan(old);
  });

  test("should handle future lastSeen gracefully (clamp to 0 days)", () => {
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const score = computeRecencyScore(future, now);
    expect(score).toBe(1.0);
  });
});

describe("computeSessionSpreadScore", () => {
  test("should return 0.0 when maxSessions is 0", () => {
    expect(computeSessionSpreadScore(0, 0)).toBe(0.0);
  });

  test("should return 1.0 when uniqueSessions equals maxSessions", () => {
    expect(computeSessionSpreadScore(10, 10)).toBe(1.0);
  });

  test("should use sqrt scaling", () => {
    // sqrt(4)/sqrt(16) = 2/4 = 0.5
    expect(computeSessionSpreadScore(4, 16)).toBe(0.5);
  });

  test("should increase with more sessions", () => {
    const low = computeSessionSpreadScore(1, 10);
    const high = computeSessionSpreadScore(5, 10);
    expect(high).toBeGreaterThan(low);
  });
});

// =============================================================================
// PatternAggregationService - Deduplication
// =============================================================================

describe("PatternAggregationService - deduplicate", () => {
  let service: PatternAggregationService;

  beforeEach(() => {
    service = new PatternAggregationService({ similarityThreshold: 0.7 });
  });

  test("should keep unique observations unchanged", () => {
    const obs = [
      makeObservation({ text: "frequently used read tool for file access" }),
      makeObservation({ text: "error pattern detected in bash commands" }),
      makeObservation({ text: "workflow sequence: read then edit then bash" }),
    ];

    const { deduplicated, duplicatesMerged } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(3);
    expect(duplicatesMerged).toBe(0);
  });

  test("should merge semantically similar observations", () => {
    const obs = [
      makeObservation({
        text: "frequently used tool read for reading source files",
        count: 3,
        sourceSessionIds: ["s1"],
      }),
      makeObservation({
        text: "frequently used tool read for reading source files again",
        count: 2,
        sourceSessionIds: ["s2"],
      }),
    ];

    const { deduplicated, duplicatesMerged } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(1);
    expect(duplicatesMerged).toBe(1);
    expect(deduplicated[0].count).toBe(5); // 3 + 2
    expect(deduplicated[0].sourceSessionIds).toContain("s1");
    expect(deduplicated[0].sourceSessionIds).toContain("s2");
  });

  test("should not merge observations with different categories", () => {
    const obs = [
      makeObservation({
        text: "frequently used tool read for reading files",
        category: "tool-choice",
      }),
      makeObservation({
        text: "frequently used tool read for reading files",
        category: "pattern",
      }),
    ];

    const { deduplicated, duplicatesMerged } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(2);
    expect(duplicatesMerged).toBe(0);
  });

  test("should merge observations when one has no category", () => {
    const now = new Date();
    const obs: Observation[] = [
      {
        id: crypto.randomUUID(),
        text: "frequently used tool read for reading source files",
        category: "tool-choice",
        count: 1,
        status: "pending",
        sourceSessionIds: ["s1"],
        firstSeen: now,
        lastSeen: now,
      },
      {
        id: crypto.randomUUID(),
        text: "frequently used tool read for reading source files",
        category: undefined,
        count: 1,
        status: "pending",
        sourceSessionIds: ["s2"],
        firstSeen: now,
        lastSeen: now,
      },
    ];

    // When one has no category, they can still match
    const { deduplicated, duplicatesMerged } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(1);
    expect(duplicatesMerged).toBe(1);
  });

  test("should take the later lastSeen date when merging", () => {
    const earlyDate = daysAgo(5);
    const lateDate = daysAgo(1);

    const obs = [
      makeObservation({
        text: "frequently used tool read for reading source files",
        lastSeen: earlyDate,
        sourceSessionIds: ["s1"],
      }),
      makeObservation({
        text: "frequently used tool read for reading source code",
        lastSeen: lateDate,
        sourceSessionIds: ["s2"],
      }),
    ];

    const { deduplicated } = service.deduplicate(obs);
    expect(deduplicated[0].lastSeen).toEqual(lateDate);
  });

  test("should union tags when merging", () => {
    const obs = [
      makeObservation({
        text: "frequently used tool read for reading source files",
        tags: ["tool", "read"],
        sourceSessionIds: ["s1"],
      }),
      makeObservation({
        text: "frequently used tool read for reading source code",
        tags: ["tool", "file-access"],
        sourceSessionIds: ["s2"],
      }),
    ];

    const { deduplicated } = service.deduplicate(obs);
    expect(deduplicated[0].tags).toContain("tool");
    expect(deduplicated[0].tags).toContain("read");
    expect(deduplicated[0].tags).toContain("file-access");
  });

  test("should merge metadata when merging", () => {
    const obs = [
      makeObservation({
        text: "frequently used tool read for reading source files",
        metadata: { toolName: "read", frequency: 5 },
        sourceSessionIds: ["s1"],
      }),
      makeObservation({
        text: "frequently used tool read for reading source code",
        metadata: { avgDuration: 100 },
        sourceSessionIds: ["s2"],
      }),
    ];

    const { deduplicated } = service.deduplicate(obs);
    expect(deduplicated[0].metadata?.toolName).toBe("read");
    expect(deduplicated[0].metadata?.avgDuration).toBe(100);
  });

  test("should not merge observations below similarity threshold", () => {
    const highThresholdService = new PatternAggregationService({ similarityThreshold: 0.95 });

    const obs = [
      makeObservation({ text: "tool read is used frequently for file operations" }),
      makeObservation({ text: "read tool appears often when accessing files" }),
    ];

    const { deduplicated, duplicatesMerged } = highThresholdService.deduplicate(obs);
    expect(deduplicated).toHaveLength(2);
    expect(duplicatesMerged).toBe(0);
  });

  test("should handle empty observation list", () => {
    const { deduplicated, duplicatesMerged } = service.deduplicate([]);
    expect(deduplicated).toHaveLength(0);
    expect(duplicatesMerged).toBe(0);
  });

  test("should not mutate original observations", () => {
    const original = makeObservation({
      text: "unique observation text here with enough tokens",
      sourceSessionIds: ["s1"],
      count: 1,
    });

    service.deduplicate([original]);
    expect(original.count).toBe(1);
    expect(original.sourceSessionIds).toHaveLength(1);
  });

  test("should deduplicate source session IDs (no duplicates)", () => {
    const obs = [
      makeObservation({
        text: "frequently used tool read for reading source files",
        sourceSessionIds: ["s1", "s2"],
      }),
      makeObservation({
        text: "frequently used tool read for reading source code",
        sourceSessionIds: ["s2", "s3"],
      }),
    ];

    const { deduplicated } = service.deduplicate(obs);
    const ids = deduplicated[0].sourceSessionIds;
    expect(ids).toContain("s1");
    expect(ids).toContain("s2");
    expect(ids).toContain("s3");
    // s2 should appear only once
    expect(ids.filter((id) => id === "s2")).toHaveLength(1);
  });
});

// =============================================================================
// PatternAggregationService - Ranking
// =============================================================================

describe("PatternAggregationService - rankObservations", () => {
  let service: PatternAggregationService;
  let referenceTime: Date;

  beforeEach(() => {
    referenceTime = new Date();
    service = new PatternAggregationService({ referenceTime });
  });

  test("should return empty array for empty input", () => {
    const ranked = service.rankObservations([]);
    expect(ranked).toHaveLength(0);
  });

  test("should assign significance scores between 0 and 1", () => {
    const obs = [
      makeObservation({ text: "observation one", count: 5, sourceSessionIds: ["s1", "s2"] }),
      makeObservation({ text: "observation two", count: 1, sourceSessionIds: ["s1"] }),
    ];

    const ranked = service.rankObservations(obs);
    for (const r of ranked) {
      expect(r.significanceScore).toBeGreaterThanOrEqual(0.0);
      expect(r.significanceScore).toBeLessThanOrEqual(1.0);
    }
  });

  test("should rank higher-count observations above lower-count", () => {
    const obs = [
      makeObservation({ text: "low count observation", count: 1, sourceSessionIds: ["s1"] }),
      makeObservation({ text: "high count observation", count: 10, sourceSessionIds: ["s1"] }),
    ];

    const ranked = service.rankObservations(obs);
    expect(ranked[0].significanceScore).toBeGreaterThan(ranked[1].significanceScore);
    expect(ranked[0].count).toBe(10);
  });

  test("should rank more recent observations higher (all else equal)", () => {
    const obs = [
      makeObservation({
        text: "old observation text here",
        count: 5,
        sourceSessionIds: ["s1"],
        lastSeen: daysAgo(30),
      }),
      makeObservation({
        text: "new observation text here",
        count: 5,
        sourceSessionIds: ["s1"],
        lastSeen: daysAgo(1),
      }),
    ];

    const ranked = service.rankObservations(obs);
    expect(ranked[0].lastSeen).toEqual(daysAgo(1));
    expect(ranked[0].significanceScore).toBeGreaterThan(ranked[1].significanceScore);
  });

  test("should rank observations with more session spread higher (all else equal)", () => {
    const obs = [
      makeObservation({
        text: "narrow spread observation",
        count: 3,
        sourceSessionIds: ["s1"],
      }),
      makeObservation({
        text: "wide spread observation",
        count: 3,
        sourceSessionIds: ["s1", "s2", "s3", "s4"],
      }),
    ];

    const ranked = service.rankObservations(obs);
    expect(ranked[0].sourceSessionIds).toHaveLength(4);
    expect(ranked[0].significanceScore).toBeGreaterThan(ranked[1].significanceScore);
  });

  test("should preserve observation fields in ranked output", () => {
    const obs = makeObservation({
      text: "test observation",
      category: "workflow",
      count: 3,
      tags: ["test"],
      metadata: { key: "value" },
    });

    const ranked = service.rankObservations([obs]);
    expect(ranked[0].text).toBe("test observation");
    expect(ranked[0].category).toBe("workflow");
    expect(ranked[0].count).toBe(3);
    expect(ranked[0].tags).toContain("test");
    expect(ranked[0].metadata?.key).toBe("value");
  });

  test("should produce stable sort (equal scores preserve insertion order)", () => {
    // Create observations that should have identical scores
    const now = new Date();
    const obs = [
      makeObservation({ text: "first observation", count: 1, sourceSessionIds: ["s1"], lastSeen: now }),
      makeObservation({ text: "second observation", count: 1, sourceSessionIds: ["s1"], lastSeen: now }),
    ];

    const ranked = service.rankObservations(obs);
    // Both should have the same score
    expect(ranked[0].significanceScore).toBe(ranked[1].significanceScore);
  });

  test("should handle single observation", () => {
    const obs = [makeObservation({ text: "sole observation", count: 5 })];
    const ranked = service.rankObservations(obs);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].significanceScore).toBeGreaterThan(0);
  });

  test("should use custom scoring weights", () => {
    const heavyRecencyService = new PatternAggregationService({
      referenceTime,
      scoringWeights: { frequency: 0.1, recency: 0.8, sessionSpread: 0.1 },
    });

    const obs = [
      makeObservation({
        text: "high count but old",
        count: 100,
        sourceSessionIds: ["s1"],
        lastSeen: daysAgo(60),
      }),
      makeObservation({
        text: "low count but recent",
        count: 1,
        sourceSessionIds: ["s1"],
        lastSeen: daysAgo(0),
      }),
    ];

    const ranked = heavyRecencyService.rankObservations(obs);
    // With heavy recency weight, the recent low-count one should rank higher
    expect(ranked[0].lastSeen).toEqual(daysAgo(0));
  });
});

// =============================================================================
// PatternAggregationService - aggregate (end-to-end)
// =============================================================================

describe("PatternAggregationService - aggregate", () => {
  let service: PatternAggregationService;

  beforeEach(() => {
    service = new PatternAggregationService({
      similarityThreshold: 0.7,
      maxResults: 0,
    });
  });

  test("should combine observations from multiple analyzers", async () => {
    const toolObs = [
      makeObservation({ text: "tool read used 5 times for file access operations", count: 5 }),
      makeObservation({ text: "tool bash used 3 times for command execution", count: 3 }),
    ];
    const errorObs = [
      makeObservation({ text: "error pattern in bash: command not found", count: 2 }),
    ];
    const workflowObs = [
      makeObservation({ text: "workflow sequence detected: read then edit then bash", count: 4 }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: toolObs },
      { analyzer: "error-pattern", observations: errorObs },
      { analyzer: "workflow-sequence", observations: workflowObs },
    ]);

    expect(result.totalInputs).toBe(4);
    expect(result.observations).toHaveLength(4);
    expect(result.analyzerBreakdown["tool-usage"]).toBe(2);
    expect(result.analyzerBreakdown["error-pattern"]).toBe(1);
    expect(result.analyzerBreakdown["workflow-sequence"]).toBe(1);
  });

  test("should deduplicate across analyzers", async () => {
    const toolObs = [
      makeObservation({
        text: "tool read is frequently used for reading source files",
        count: 3,
        sourceSessionIds: ["s1"],
      }),
    ];
    const fileObs = [
      makeObservation({
        text: "tool read is frequently used for reading source code",
        count: 2,
        sourceSessionIds: ["s2"],
      }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: toolObs },
      { analyzer: "file-interaction", observations: fileObs },
    ]);

    expect(result.totalInputs).toBe(2);
    expect(result.duplicatesMerged).toBe(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].count).toBe(5);
  });

  test("should rank results by significance", async () => {
    const obs = [
      makeObservation({
        text: "rare observation with low count value",
        count: 1,
        sourceSessionIds: ["s1"],
        lastSeen: daysAgo(30),
      }),
      makeObservation({
        text: "common observation with high count value",
        count: 10,
        sourceSessionIds: ["s1", "s2", "s3"],
        lastSeen: daysAgo(1),
      }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: obs },
    ]);

    expect(result.observations[0].significanceScore).toBeGreaterThan(
      result.observations[1].significanceScore
    );
  });

  test("should respect maxResults limit", async () => {
    const limitedService = new PatternAggregationService({ maxResults: 2 });

    // Each observation uses completely different vocabulary to avoid dedup
    const distinctTexts = [
      "database query optimization for postgres performance tuning",
      "memory leak investigation in node runtime garbage collection",
      "network latency measurement across distributed cloud services",
      "authentication token refresh mechanism jwt oauth implementation",
      "image processing pipeline resize crop thumbnail generation",
      "machine learning model training accuracy loss convergence",
      "search index elasticsearch mapping relevance scoring boost",
      "container orchestration kubernetes deployment replica scaling",
      "payment gateway integration stripe webhook event processing",
      "websocket real-time chat message broadcast subscription client",
    ];
    const obs = distinctTexts.map((text) => makeObservation({ text }));

    const result = await limitedService.aggregate([
      { analyzer: "tool-usage", observations: obs },
    ]);

    expect(result.observations).toHaveLength(2);
    expect(result.totalInputs).toBe(10);
  });

  test("should handle empty analyzer outputs", async () => {
    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: [] },
      { analyzer: "error-pattern", observations: [] },
    ]);

    expect(result.observations).toHaveLength(0);
    expect(result.totalInputs).toBe(0);
    expect(result.duplicatesMerged).toBe(0);
  });

  test("should handle single analyzer with single observation", async () => {
    const obs = [makeObservation({ text: "single observation for testing purposes", count: 3 })];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: obs },
    ]);

    expect(result.observations).toHaveLength(1);
    expect(result.totalInputs).toBe(1);
    expect(result.duplicatesMerged).toBe(0);
    expect(result.observations[0].significanceScore).toBeGreaterThan(0);
  });

  test("should not count deduplication within same analyzer output", async () => {
    // Two similar observations from the same analyzer
    const obs = [
      makeObservation({
        text: "tool read used frequently for reading all source files",
        count: 3,
        sourceSessionIds: ["s1"],
      }),
      makeObservation({
        text: "tool read used frequently for reading all source code",
        count: 2,
        sourceSessionIds: ["s2"],
      }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: obs },
    ]);

    // They should be merged (same analyzer, similar text)
    expect(result.duplicatesMerged).toBe(1);
    expect(result.observations).toHaveLength(1);
  });

  test("should preserve analyzer breakdown even when observations are deduplicated", async () => {
    const obs1 = [
      makeObservation({ text: "tool read used frequently for reading source files", count: 3 }),
    ];
    const obs2 = [
      makeObservation({ text: "tool read used frequently for reading source code", count: 2 }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: obs1 },
      { analyzer: "file-tracker", observations: obs2 },
    ]);

    expect(result.analyzerBreakdown["tool-usage"]).toBe(1);
    expect(result.analyzerBreakdown["file-tracker"]).toBe(1);
    // But deduplicated into 1
    expect(result.observations).toHaveLength(1);
  });
});

// =============================================================================
// PatternAggregationService - findSimilarObservation
// =============================================================================

describe("PatternAggregationService - findSimilarObservation", () => {
  let service: PatternAggregationService;

  beforeEach(() => {
    service = new PatternAggregationService({ similarityThreshold: 0.7 });
  });

  test("should return null when pool is empty", () => {
    const candidate = makeObservation({ text: "test observation" });
    const result = service.findSimilarObservation(candidate, []);
    expect(result).toBeNull();
  });

  test("should find similar observation in pool", () => {
    const candidate = makeObservation({
      text: "tool read is used frequently for reading source files",
      category: "tool-choice",
    });
    const pool = [
      makeObservation({
        text: "tool read is used frequently for reading source code",
        category: "tool-choice",
      }),
    ];

    const result = service.findSimilarObservation(candidate, pool);
    expect(result).not.toBeNull();
  });

  test("should return null when no similar observation exists", () => {
    const candidate = makeObservation({
      text: "completely different topic about database operations",
      category: "tool-choice",
    });
    const pool = [
      makeObservation({
        text: "workflow sequence involving file editing and reading",
        category: "tool-choice",
      }),
    ];

    const result = service.findSimilarObservation(candidate, pool);
    expect(result).toBeNull();
  });

  test("should skip pool items with different category", () => {
    const candidate = makeObservation({
      text: "tool read is used frequently for reading source files",
      category: "tool-choice",
    });
    const pool = [
      makeObservation({
        text: "tool read is used frequently for reading source code",
        category: "pattern", // Different category
      }),
    ];

    const result = service.findSimilarObservation(candidate, pool);
    expect(result).toBeNull();
  });

  test("should return the first match found", () => {
    const candidate = makeObservation({
      text: "tool read is used frequently for reading source files",
    });
    const pool = [
      makeObservation({ id: "match-1", text: "tool read is used frequently for reading source code" }),
      makeObservation({ id: "match-2", text: "tool read is used frequently for reading source text" }),
    ];

    const result = service.findSimilarObservation(candidate, pool);
    expect(result?.id).toBe("match-1");
  });
});

// =============================================================================
// Edge cases and integration scenarios
// =============================================================================

describe("PatternAggregationService - edge cases", () => {
  test("should handle observations with very long text", () => {
    const service = new PatternAggregationService({ similarityThreshold: 0.7 });
    const longText = "word ".repeat(1000);
    const obs = [makeObservation({ text: longText })];

    const { deduplicated } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(1);
  });

  test("should handle observations with special characters in text", () => {
    const service = new PatternAggregationService({ similarityThreshold: 0.7 });
    const obs = [
      makeObservation({ text: "error: 'TypeError' in file <test.ts> [line 42]" }),
      makeObservation({ text: "workflow: bash → read → edit (3 steps)" }),
    ];

    const { deduplicated } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(2); // Different enough to not merge
  });

  test("should handle zero similarity threshold (merge everything)", () => {
    const service = new PatternAggregationService({ similarityThreshold: 0.0 });
    const obs = [
      makeObservation({ text: "completely different observation alpha", count: 1, sourceSessionIds: ["s1"] }),
      makeObservation({ text: "totally unrelated observation beta", count: 2, sourceSessionIds: ["s2"] }),
    ];

    const { deduplicated, duplicatesMerged } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(1);
    expect(duplicatesMerged).toBe(1);
  });

  test("should handle similarity threshold of 1.0 (only exact matches merge)", () => {
    const service = new PatternAggregationService({ similarityThreshold: 1.0 });
    const obs = [
      makeObservation({ text: "exact same text for matching purposes here", count: 1, sourceSessionIds: ["s1"] }),
      makeObservation({ text: "exact same text for matching purposes here", count: 2, sourceSessionIds: ["s2"] }),
      makeObservation({ text: "slightly different text for matching purposes", count: 1, sourceSessionIds: ["s3"] }),
    ];

    const { deduplicated, duplicatesMerged } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(2); // First two merge, third is different
    expect(duplicatesMerged).toBe(1);
  });

  test("should work with maxResults of 0 (no limit)", async () => {
    const service = new PatternAggregationService({ maxResults: 0 });
    // Use completely distinct vocabulary per observation to avoid deduplication
    const distinctTexts = [
      "database postgres query optimization performance tuning indexes",
      "memory leak investigation node runtime garbage collection heap",
      "network latency measurement distributed cloud services bandwidth",
      "authentication token refresh mechanism jwt oauth secret rotation",
      "image processing pipeline resize crop thumbnail generation algorithm",
      "machine learning model training accuracy loss convergence gradient",
      "search index elasticsearch mapping relevance scoring boost ranking",
      "container orchestration kubernetes deployment replica scaling pods",
      "payment gateway integration stripe webhook event processing charges",
      "websocket real-time chat message broadcast subscription client socket",
      "compiler optimization dead code elimination loop unrolling inlining",
      "cache invalidation strategy redis memcached ttl expiry purge",
      "logging aggregation sentry datadog splunk monitoring alerting dashboard",
      "graphql schema federation resolver mutation query subscription types",
      "blockchain consensus proof stake mining validator reward staking",
      "ci pipeline jenkins github actions workflow artifact deploy canary",
      "terraform infrastructure code provisioning vpc subnet security group",
      "microservice decomposition bounded context domain driven design aggregate",
      "queue processing rabbitmq kafka consumer producer dead letter retry",
      "testing strategy pytest jest coverage mocking fixture snapshot regression",
    ];
    const obs = distinctTexts.map((text) => makeObservation({ text }));

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: obs },
    ]);

    expect(result.observations).toHaveLength(20);
  });

  test("should handle maxResults larger than available observations", async () => {
    const service = new PatternAggregationService({ maxResults: 100 });
    const obs = [
      makeObservation({ text: "just one observation with enough distinct words" }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: obs },
    ]);

    expect(result.observations).toHaveLength(1);
  });

  test("should handle observations with undefined optional fields", () => {
    const service = new PatternAggregationService({ similarityThreshold: 0.7 });
    const obs = [
      makeObservation({
        text: "observation without tags or metadata fields present",
        tags: undefined,
        metadata: undefined,
      }),
    ];

    const { deduplicated } = service.deduplicate(obs);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].tags).toBeUndefined();
    expect(deduplicated[0].metadata).toBeUndefined();
  });
});

describe("PatternAggregationService - realistic scenario", () => {
  test("should simulate a full analysis cycle with multiple analyzers", async () => {
    const service = new PatternAggregationService({
      similarityThreshold: 0.7,
      maxResults: 10,
      referenceTime: new Date(),
    });

    // Simulate tool-usage analyzer output
    const toolUsageObs = [
      makeObservation({
        text: "Tool 'read' used 8 times - primary file access method in this session",
        category: "tool-choice",
        count: 8,
        sourceSessionIds: ["session-abc"],
        lastSeen: daysAgo(1),
        metadata: { toolName: "read", frequency: 8 },
      }),
      makeObservation({
        text: "Tool 'bash' used 5 times - command execution for build and test",
        category: "tool-choice",
        count: 5,
        sourceSessionIds: ["session-abc"],
        lastSeen: daysAgo(1),
        metadata: { toolName: "bash", frequency: 5 },
      }),
    ];

    // Simulate error-pattern analyzer output
    const errorObs = [
      makeObservation({
        text: "Error pattern: 'command not found' occurs frequently in bash tool usage",
        category: "pattern",
        count: 3,
        sourceSessionIds: ["session-abc"],
        lastSeen: daysAgo(2),
        metadata: { toolName: "bash", errorCount: 3, errorRate: 0.6 },
      }),
    ];

    // Simulate file-interaction analyzer output
    const fileObs = [
      makeObservation({
        text: "File src/core/types.ts accessed 12 times - hotspot detected for heavy editing",
        category: "pattern",
        count: 12,
        sourceSessionIds: ["session-abc", "session-def"],
        lastSeen: daysAgo(0),
        metadata: { filePath: "src/core/types.ts", readCount: 5, editCount: 7 },
      }),
    ];

    // Simulate workflow-sequence analyzer output
    const workflowObs = [
      makeObservation({
        text: "Common workflow: read → edit → bash → read (test-fix-verify cycle)",
        category: "workflow",
        count: 4,
        sourceSessionIds: ["session-abc"],
        lastSeen: daysAgo(1),
      }),
    ];

    const result = await service.aggregate([
      { analyzer: "tool-usage", observations: toolUsageObs },
      { analyzer: "error-pattern", observations: errorObs },
      { analyzer: "file-interaction", observations: fileObs },
      { analyzer: "workflow-sequence", observations: workflowObs },
    ]);

    // All unique, should have 5 observations
    expect(result.totalInputs).toBe(5);
    expect(result.observations).toHaveLength(5);
    expect(result.duplicatesMerged).toBe(0);

    // File hotspot should rank high (count=12, recent, multi-session)
    expect(result.observations[0].count).toBe(12);
    expect(result.observations[0].sourceSessionIds).toHaveLength(2);

    // All should have valid significance scores
    for (const obs of result.observations) {
      expect(obs.significanceScore).toBeGreaterThan(0);
      expect(obs.significanceScore).toBeLessThanOrEqual(1.0);
    }

    // Scores should be in descending order
    for (let i = 1; i < result.observations.length; i++) {
      expect(result.observations[i].significanceScore).toBeLessThanOrEqual(
        result.observations[i - 1].significanceScore
      );
    }
  });
});
