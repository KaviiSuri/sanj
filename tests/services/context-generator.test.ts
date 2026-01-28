/**
 * Tests for services/context-generator.ts
 *
 * Validates ContextGeneratorService: markdown generation, category grouping,
 * relevance filtering, section formatting, and token estimation.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { ContextGeneratorService } from "../../src/services/context-generator.ts";
import type { LongTermMemory, Observation } from "../../src/core/types.ts";

// =============================================================================
// Test Helpers
// =============================================================================

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    text: overrides.text ?? "test observation pattern",
    category: overrides.category ?? "pattern",
    count: overrides.count ?? 3,
    status: overrides.status ?? "approved",
    sourceSessionIds: overrides.sourceSessionIds ?? ["session-1"],
    firstSeen: overrides.firstSeen ?? now,
    lastSeen: overrides.lastSeen ?? now,
    tags: overrides.tags,
    metadata: overrides.metadata,
  };
}

function makeLongTermMemory(overrides: Partial<LongTermMemory> = {}): LongTermMemory {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    observation: overrides.observation ?? makeObservation(),
    promotedAt: overrides.promotedAt ?? now,
    status: overrides.status ?? "approved",
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// =============================================================================
// generateContext
// =============================================================================

describe("ContextGeneratorService - generateContext", () => {
  let service: ContextGeneratorService;

  beforeEach(() => {
    service = new ContextGeneratorService({
      relevanceThreshold: 0.0, // Accept everything
      maxItemsPerCategory: 10,
      defaultTargetFile: "CLAUDE.md",
    });
  });

  test("produces markdown output with header", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Use read tool for file access", lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.markdown).toContain("## AI Assistant Patterns & Preferences");
  });

  test("produces markdown output with sections for each category", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Prefer read tool", category: "preference", lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "Use bash for builds", category: "workflow", lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.markdown).toContain("### Preferences");
    expect(result.markdown).toContain("### Workflows");
    expect(result.sections).toHaveLength(2);
  });

  test("includes target file reference in markdown header", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Tool usage pattern", lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories, "AGENTS.md");
    expect(result.targetFile).toBe("AGENTS.md");
    expect(result.markdown).toContain("AGENTS.md");
  });

  test("uses default target file when none specified", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Default target test", lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.targetFile).toBe("CLAUDE.md");
  });

  test("returns metadata about included/filtered memories", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 10, lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.totalMemoriesInput).toBe(1);
    expect(result.memoriesIncluded).toBeDefined();
    expect(result.memoriesFiltered).toBeDefined();
    expect(result.totalMemoriesInput).toBe(result.memoriesIncluded + result.memoriesFiltered);
  });

  test("handles empty memory array", () => {
    const result = service.generateContext([]);
    expect(result.markdown).toContain("No memories available");
    expect(result.totalMemoriesInput).toBe(0);
    expect(result.memoriesIncluded).toBe(0);
    expect(result.sections).toHaveLength(0);
  });

  test("items are formatted as markdown list entries with count", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Use TypeScript strict mode", count: 7, lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.markdown).toContain("**Use TypeScript strict mode**");
    expect(result.markdown).toContain("_(seen 7 times)_");
  });

  test("generatedAt timestamp is set", () => {
    const result = service.generateContext([]);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  test("estimatedTokenCount is positive for non-empty output", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Some pattern observation text", lastSeen: new Date() }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.estimatedTokenCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// filterByRelevance
// =============================================================================

describe("ContextGeneratorService - filterByRelevance", () => {
  let service: ContextGeneratorService;

  beforeEach(() => {
    service = new ContextGeneratorService({});
  });

  test("filters out memories below the threshold", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 100, sourceSessionIds: ["s1", "s2", "s3"], lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 1, sourceSessionIds: ["s1"], lastSeen: daysAgo(90) }),
      }),
    ];

    // High threshold should filter out the low-relevance one
    const filtered = service.filterByRelevance(memories, 0.8);
    expect(filtered.length).toBeLessThan(memories.length);
  });

  test("threshold of 0 keeps all memories", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 1, lastSeen: daysAgo(60) }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 1, lastSeen: daysAgo(60) }),
      }),
    ];

    const filtered = service.filterByRelevance(memories, 0);
    expect(filtered).toHaveLength(2);
  });

  test("threshold of 1 only keeps highest relevance", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 10, sourceSessionIds: ["s1", "s2", "s3"], lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 1, sourceSessionIds: ["s1"], lastSeen: daysAgo(60) }),
      }),
    ];

    const filtered = service.filterByRelevance(memories, 1.0);
    // At most one should survive (the highest scorer)
    expect(filtered.length).toBeLessThanOrEqual(1);
  });

  test("returns empty for empty input", () => {
    const filtered = service.filterByRelevance([], 0.5);
    expect(filtered).toHaveLength(0);
  });

  test("preserves memory order or returns subset", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 5, lastSeen: new Date() }),
      }),
    ];

    const filtered = service.filterByRelevance(memories, 0.1);
    // The surviving memory should be from the original set
    if (filtered.length > 0) {
      expect(filtered[0].id).toBe(memories[0].id);
    }
  });
});

// =============================================================================
// formatSection
// =============================================================================

describe("ContextGeneratorService - formatSection", () => {
  let service: ContextGeneratorService;

  beforeEach(() => {
    service = new ContextGeneratorService({
      maxItemsPerCategory: 5,
    });
  });

  test("produces valid section with heading and items", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Use strict mode", count: 5, lastSeen: new Date() }),
      }),
    ];

    const section = service.formatSection("preference", memories);
    expect(section.heading).toBe("Preferences");
    expect(section.category).toBe("preference");
    expect(section.items).toHaveLength(1);
    expect(section.items[0].text).toBe("Use strict mode");
    expect(section.items[0].count).toBe(5);
    expect(section.items[0].category).toBe("preference");
  });

  test("items have relevance scores", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 10, lastSeen: new Date() }),
      }),
    ];

    const section = service.formatSection("pattern", memories);
    expect(section.items[0].relevanceScore).toBeGreaterThan(0);
    expect(section.items[0].relevanceScore).toBeLessThanOrEqual(1.0);
  });

  test("items are sorted by relevance descending", () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "low relevance item", count: 1, lastSeen: daysAgo(30) }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "high relevance item", count: 20, lastSeen: new Date() }),
      }),
    ];

    const section = service.formatSection("pattern", memories);
    if (section.items.length === 2) {
      expect(section.items[0].relevanceScore).toBeGreaterThanOrEqual(section.items[1].relevanceScore);
    }
  });

  test("respects maxItemsPerCategory limit", () => {
    const limitedService = new ContextGeneratorService({ maxItemsPerCategory: 2 });
    const memories = Array.from({ length: 5 }, (_, i) =>
      makeLongTermMemory({
        observation: makeObservation({ text: `item ${i}`, count: i + 1, lastSeen: new Date() }),
      })
    );

    const section = limitedService.formatSection("pattern", memories);
    expect(section.items).toHaveLength(2);
  });

  test("maxItemsPerCategory of 0 does not limit items", () => {
    const unlimitedService = new ContextGeneratorService({ maxItemsPerCategory: 0 });
    const memories = Array.from({ length: 15 }, (_, i) =>
      makeLongTermMemory({
        observation: makeObservation({ text: `item ${i}`, count: i + 1, lastSeen: new Date() }),
      })
    );

    const section = unlimitedService.formatSection("pattern", memories);
    expect(section.items).toHaveLength(15);
  });

  test("section has sourceMemoryId for traceability", () => {
    const memId = crypto.randomUUID();
    const memories = [
      makeLongTermMemory({
        id: memId,
        observation: makeObservation({ lastSeen: new Date() }),
      }),
    ];

    const section = service.formatSection("workflow", memories);
    expect(section.items[0].sourceMemoryId).toBe(memId);
  });

  test("uses correct heading for each category", () => {
    const memories = [makeLongTermMemory({ observation: makeObservation({ lastSeen: new Date() }) })];

    expect(service.formatSection("preference", memories).heading).toBe("Preferences");
    expect(service.formatSection("pattern", memories).heading).toBe("Patterns");
    expect(service.formatSection("workflow", memories).heading).toBe("Workflows");
    expect(service.formatSection("tool-choice", memories).heading).toBe("Tool Choices");
    expect(service.formatSection("style", memories).heading).toBe("Style Conventions");
    expect(service.formatSection("other", memories).heading).toBe("Other Observations");
  });
});

// =============================================================================
// groupByCategory
// =============================================================================

describe("ContextGeneratorService - groupByCategory", () => {
  let service: ContextGeneratorService;

  beforeEach(() => {
    service = new ContextGeneratorService({});
  });

  test("correctly partitions memories by category", () => {
    const memories = [
      makeLongTermMemory({ observation: makeObservation({ category: "preference" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "workflow" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "preference" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "pattern" }) }),
    ];

    const groups = service.groupByCategory(memories);
    expect(groups.get("preference")).toHaveLength(2);
    expect(groups.get("workflow")).toHaveLength(1);
    expect(groups.get("pattern")).toHaveLength(1);
  });

  test("places uncategorised memories in other bucket", () => {
    const now = new Date();
    const uncategorised: Observation = {
      id: crypto.randomUUID(),
      text: "uncategorised observation",
      count: 1,
      status: "approved",
      sourceSessionIds: ["s1"],
      firstSeen: now,
      lastSeen: now,
      // category intentionally omitted
    };
    const memories = [makeLongTermMemory({ observation: uncategorised })];

    const groups = service.groupByCategory(memories);
    expect(groups.get("other")).toHaveLength(1);
  });

  test("returns empty map for empty input", () => {
    const groups = service.groupByCategory([]);
    expect(groups.size).toBe(0);
  });

  test("single category produces single group", () => {
    const memories = [
      makeLongTermMemory({ observation: makeObservation({ category: "style" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "style" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "style" }) }),
    ];

    const groups = service.groupByCategory(memories);
    expect(groups.size).toBe(1);
    expect(groups.get("style")).toHaveLength(3);
  });

  test("all categories are accounted for", () => {
    const memories = [
      makeLongTermMemory({ observation: makeObservation({ category: "preference" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "pattern" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "workflow" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "tool-choice" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "style" }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "other" }) }),
    ];

    const groups = service.groupByCategory(memories);
    expect(groups.size).toBe(6);
  });
});

// =============================================================================
// estimateTokenCount
// =============================================================================

describe("ContextGeneratorService - estimateTokenCount", () => {
  let service: ContextGeneratorService;

  beforeEach(() => {
    service = new ContextGeneratorService({});
  });

  test("returns reasonable token estimate for short text", () => {
    const text = "Hello world"; // 11 chars, ~3 tokens at 4 chars/token
    const estimate = service.estimateTokenCount(text);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(10);
  });

  test("scales linearly with text length", () => {
    const short = service.estimateTokenCount("short");
    const long = service.estimateTokenCount("a".repeat(400)); // 100 tokens at 4 chars/token

    expect(long).toBeGreaterThan(short);
    expect(long).toBe(100);
  });

  test("returns 0 for empty string", () => {
    expect(service.estimateTokenCount("")).toBe(0);
  });

  test("rounds up for partial tokens", () => {
    // 5 characters = 1.25 tokens, should round up to 2
    const estimate = service.estimateTokenCount("hello");
    expect(estimate).toBe(2);
  });

  test("handles unicode characters", () => {
    // Unicode chars may be multi-byte but estimateTokenCount works on string length
    const text = "emoji test";
    const estimate = service.estimateTokenCount(text);
    expect(estimate).toBeGreaterThan(0);
  });

  test("provides reasonable estimate for typical markdown context", () => {
    const markdown = [
      "## AI Assistant Patterns & Preferences",
      "*Last updated: 2024-01-15 | Written to: CLAUDE.md*",
      "",
      "### Preferences",
      "- **Use read tool for file access** _(seen 10 times)_",
      "- **Prefer TypeScript strict mode** _(seen 7 times)_",
      "",
      "### Workflows",
      "- **Read then edit then test cycle** _(seen 5 times)_",
      "",
    ].join("\n");

    const estimate = service.estimateTokenCount(markdown);
    // Should be in the hundreds range for this amount of text
    expect(estimate).toBeGreaterThan(50);
    expect(estimate).toBeLessThan(500);
  });
});

// =============================================================================
// generateContext - category ordering
// =============================================================================

describe("ContextGeneratorService - category ordering", () => {
  let service: ContextGeneratorService;

  beforeEach(() => {
    service = new ContextGeneratorService({
      relevanceThreshold: 0.0,
    });
  });

  test("sections appear in canonical category order", () => {
    // Insert in reverse canonical order
    const memories = [
      makeLongTermMemory({ observation: makeObservation({ category: "other", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "style", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "pattern", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "tool-choice", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "workflow", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ category: "preference", lastSeen: new Date() }) }),
    ];

    const result = service.generateContext(memories);
    const categoryOrder = result.sections.map((s) => s.category);

    // Canonical order: preference, workflow, tool-choice, pattern, style, other
    expect(categoryOrder.indexOf("preference")).toBeLessThan(categoryOrder.indexOf("workflow"));
    expect(categoryOrder.indexOf("workflow")).toBeLessThan(categoryOrder.indexOf("tool-choice"));
    expect(categoryOrder.indexOf("tool-choice")).toBeLessThan(categoryOrder.indexOf("pattern"));
    expect(categoryOrder.indexOf("pattern")).toBeLessThan(categoryOrder.indexOf("style"));
    expect(categoryOrder.indexOf("style")).toBeLessThan(categoryOrder.indexOf("other"));
  });
});

// =============================================================================
// generateContext - relevance filtering integration
// =============================================================================

describe("ContextGeneratorService - generateContext relevance filtering", () => {
  test("high threshold filters low-relevance memories from output", () => {
    const service = new ContextGeneratorService({
      relevanceThreshold: 0.9,
      maxItemsPerCategory: 10,
    });

    const memories = [
      makeLongTermMemory({
        observation: makeObservation({
          text: "High relevance pattern seen often",
          count: 100,
          sourceSessionIds: ["s1", "s2", "s3", "s4", "s5"],
          lastSeen: new Date(),
        }),
      }),
      makeLongTermMemory({
        observation: makeObservation({
          text: "Low relevance pattern seen once",
          count: 1,
          sourceSessionIds: ["s1"],
          lastSeen: daysAgo(60),
        }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.memoriesIncluded).toBeLessThan(result.totalMemoriesInput);
    expect(result.memoriesFiltered).toBeGreaterThan(0);
  });

  test("low threshold includes most memories", () => {
    const service = new ContextGeneratorService({
      relevanceThreshold: 0.01,
      maxItemsPerCategory: 10,
    });

    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 5, lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 3, lastSeen: daysAgo(5) }),
      }),
    ];

    const result = service.generateContext(memories);
    expect(result.memoriesIncluded).toBe(2);
  });
});
