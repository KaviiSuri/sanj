/**
 * Tests for services/memory-factory.ts
 *
 * Validates the MemoryFactory service: observation-to-memory conversion,
 * significance filtering, scope determination, and scope distribution diagnostics.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryFactory } from "../../src/services/memory-factory.ts";
import { SessionMemory, ProjectMemory, GlobalMemory } from "../../src/domain/memory.ts";
import type { Observation, Config } from "../../src/core/types.ts";

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
    status: overrides.status ?? "pending",
    sourceSessionIds: overrides.sourceSessionIds ?? ["session-1"],
    firstSeen: overrides.firstSeen ?? now,
    lastSeen: overrides.lastSeen ?? now,
    tags: overrides.tags,
    metadata: overrides.metadata,
  };
}

function makeConfig(overrides: Partial<Config["promotion"]> = {}): Config {
  return {
    version: "1.0.0",
    llmAdapter: { type: "claude-code" },
    sessionAdapters: { claudeCode: true, opencode: false },
    memoryTargets: { claudeMd: true, agentsMd: false },
    analysis: {},
    promotion: {
      observationCountThreshold: overrides.observationCountThreshold ?? 3,
      longTermDaysThreshold: overrides.longTermDaysThreshold ?? 7,
    },
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// =============================================================================
// createFromObservations
// =============================================================================

describe("MemoryFactory - createFromObservations", () => {
  let factory: MemoryFactory;

  beforeEach(() => {
    factory = new MemoryFactory({
      minSignificanceCount: 2,
      config: makeConfig(),
    });
  });

  test("basic operation creates memories from significant observations", () => {
    const observations = [
      makeObservation({ count: 5, sourceSessionIds: ["s1"] }),
      makeObservation({ count: 3, sourceSessionIds: ["s2"] }),
    ];

    const result = factory.createFromObservations(observations, "session-1", "my-project");
    expect(result.memories).toHaveLength(2);
    expect(result.filtered).toHaveLength(0);
    expect(result.totalProcessed).toBe(2);
  });

  test("filters observations below significance threshold", () => {
    const observations = [
      makeObservation({ count: 5 }),  // above threshold
      makeObservation({ count: 1 }),  // below threshold (minSignificanceCount = 2)
      makeObservation({ count: 2 }),  // at threshold
    ];

    const result = factory.createFromObservations(observations, "session-1");
    expect(result.memories).toHaveLength(2);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].count).toBe(1);
    expect(result.totalProcessed).toBe(3);
  });

  test("totalProcessed reflects input count regardless of filtering", () => {
    const observations = [
      makeObservation({ count: 1 }),
      makeObservation({ count: 1 }),
      makeObservation({ count: 1 }),
    ];

    const result = factory.createFromObservations(observations, "session-1");
    expect(result.totalProcessed).toBe(3);
    expect(result.memories).toHaveLength(0);
    expect(result.filtered).toHaveLength(3);
  });

  test("handles empty observation array", () => {
    const result = factory.createFromObservations([], "session-1");
    expect(result.memories).toHaveLength(0);
    expect(result.filtered).toHaveLength(0);
    expect(result.totalProcessed).toBe(0);
  });

  test("creates correct memory types based on scope determination", () => {
    const observations = [
      makeObservation({ count: 5, sourceSessionIds: ["s1"] }),              // single session -> SessionMemory
      makeObservation({ count: 5, sourceSessionIds: ["s1", "s2"] }),        // multi-session -> ProjectMemory
    ];

    const result = factory.createFromObservations(observations, "session-1", "my-project");
    const scopes = result.memories.map((m) => m.scope);
    expect(scopes).toContain("session");
    expect(scopes).toContain("project");
  });
});

// =============================================================================
// determineScope
// =============================================================================

describe("MemoryFactory - determineScope", () => {
  test("single session observation returns session scope", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 1,
      config: makeConfig(),
    });

    const obs = makeObservation({ sourceSessionIds: ["only-one"] });
    expect(factory.determineScope(obs)).toBe("session");
  });

  test("multi-session not meeting thresholds returns project scope", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 1,
      config: makeConfig({ observationCountThreshold: 100 }), // high threshold
    });

    const obs = makeObservation({
      count: 5,
      sourceSessionIds: ["s1", "s2"],
    });

    expect(factory.determineScope(obs)).toBe("project");
  });

  test("multi-session meeting both count and time thresholds returns global scope", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 1,
      config: makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 }),
    });

    const obs = makeObservation({
      count: 10,
      sourceSessionIds: ["s1", "s2"],
      firstSeen: daysAgo(30), // well beyond 7-day threshold
    });

    expect(factory.determineScope(obs)).toBe("global");
  });

  test("empty sourceSessionIds returns session scope", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 1,
      config: makeConfig(),
    });

    const obs = makeObservation({ sourceSessionIds: [] });
    expect(factory.determineScope(obs)).toBe("session");
  });
});

// =============================================================================
// meetsSignificanceThreshold
// =============================================================================

describe("MemoryFactory - meetsSignificanceThreshold", () => {
  test("returns true when count meets threshold", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 3,
      config: makeConfig(),
    });

    const obs = makeObservation({ count: 5 });
    expect(factory.meetsSignificanceThreshold(obs)).toBe(true);
  });

  test("returns true when count exactly equals threshold", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 3,
      config: makeConfig(),
    });

    const obs = makeObservation({ count: 3 });
    expect(factory.meetsSignificanceThreshold(obs)).toBe(true);
  });

  test("returns false when count is below threshold", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 3,
      config: makeConfig(),
    });

    const obs = makeObservation({ count: 2 });
    expect(factory.meetsSignificanceThreshold(obs)).toBe(false);
  });

  test("threshold of 1 accepts any positive count", () => {
    const factory = new MemoryFactory({
      minSignificanceCount: 1,
      config: makeConfig(),
    });

    expect(factory.meetsSignificanceThreshold(makeObservation({ count: 1 }))).toBe(true);
    expect(factory.meetsSignificanceThreshold(makeObservation({ count: 0 }))).toBe(false);
  });
});

// =============================================================================
// computeScopeDistribution
// =============================================================================

describe("MemoryFactory - computeScopeDistribution", () => {
  test("correctly counts memories at each scope", () => {
    const memories = [
      new SessionMemory(makeObservation(), "s1"),
      new SessionMemory(makeObservation(), "s2"),
      new ProjectMemory(makeObservation(), "proj-1"),
      new GlobalMemory(makeObservation()),
    ];

    const dist = MemoryFactory.computeScopeDistribution(memories);
    expect(dist.session).toBe(2);
    expect(dist.project).toBe(1);
    expect(dist.global).toBe(1);
  });

  test("returns all zeros for empty array", () => {
    const dist = MemoryFactory.computeScopeDistribution([]);
    expect(dist.session).toBe(0);
    expect(dist.project).toBe(0);
    expect(dist.global).toBe(0);
  });

  test("handles array with only one scope type", () => {
    const memories = [
      new SessionMemory(makeObservation(), "s1"),
      new SessionMemory(makeObservation(), "s2"),
      new SessionMemory(makeObservation(), "s3"),
    ];

    const dist = MemoryFactory.computeScopeDistribution(memories);
    expect(dist.session).toBe(3);
    expect(dist.project).toBe(0);
    expect(dist.global).toBe(0);
  });
});

// =============================================================================
// createMemoryItem (static)
// =============================================================================

describe("MemoryFactory - createMemoryItem", () => {
  test("creates SessionMemory for session scope", () => {
    const obs = makeObservation();
    const mem = MemoryFactory.createMemoryItem(obs, "session", "sess-1");

    expect(mem).toBeInstanceOf(SessionMemory);
    expect(mem.scope).toBe("session");
  });

  test("creates ProjectMemory for project scope", () => {
    const obs = makeObservation();
    const mem = MemoryFactory.createMemoryItem(obs, "project", undefined, "proj-1");

    expect(mem).toBeInstanceOf(ProjectMemory);
    expect(mem.scope).toBe("project");
  });

  test("creates GlobalMemory for global scope", () => {
    const obs = makeObservation();
    const mem = MemoryFactory.createMemoryItem(obs, "global");

    expect(mem).toBeInstanceOf(GlobalMemory);
    expect(mem.scope).toBe("global");
  });
});
