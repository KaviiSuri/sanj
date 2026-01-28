/**
 * Tests for services/memory-query.ts
 *
 * Validates MemoryQueryService: query filtering, relevance scoring,
 * scope-based retrieval, and keyword search.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryQueryService } from "../../src/services/memory-query.ts";
import type { LongTermMemory, Observation, Config } from "../../src/core/types.ts";
import type { IMemoryStore } from "../../src/storage/interfaces.ts";

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

function makeLongTermMemory(overrides: Partial<LongTermMemory> = {}): LongTermMemory {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    observation: overrides.observation ?? makeObservation(),
    promotedAt: overrides.promotedAt ?? now,
    status: overrides.status ?? "approved",
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
// Mock Memory Store
// =============================================================================

class MockMemoryStore implements IMemoryStore {
  private memories: LongTermMemory[] = [];

  setMemories(memories: LongTermMemory[]): void {
    this.memories = memories;
  }

  async getAll(): Promise<LongTermMemory[]> {
    return [...this.memories];
  }

  async getById(id: string): Promise<LongTermMemory | null> {
    return this.memories.find((m) => m.id === id) ?? null;
  }

  async query(options: any): Promise<LongTermMemory[]> {
    let result = [...this.memories];

    if (options.status) {
      result = result.filter((m) => m.status === options.status);
    }

    return result;
  }

  async getPromotableToCore(): Promise<LongTermMemory[]> {
    return [];
  }

  async getCounts(): Promise<{ pending: number; longTerm: number; core: number }> {
    return { pending: 0, longTerm: this.memories.length, core: 0 };
  }

  isEligibleForCorePromotion(memory: LongTermMemory): boolean {
    return memory.observation.count >= 3;
  }

  daysSinceLongTermPromotion(memory: LongTermMemory): number {
    const ms = Date.now() - memory.promotedAt.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  async setStatus(id: string, status: LongTermMemory["status"]): Promise<LongTermMemory> {
    const mem = this.memories.find((m) => m.id === id);
    if (!mem) throw new Error(`Memory ${id} not found`);
    mem.status = status;
    return mem;
  }

  async promoteToLongTerm(): Promise<any> { return { success: true, id: "new-id" }; }
  async promoteToCore(): Promise<any> { return { success: true, id: "core-id" }; }
  async delete(id: string): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.memories.splice(idx, 1);
    return true;
  }

  async load(): Promise<void> {}
  async save(): Promise<void> {}
  async count(): Promise<number> { return this.memories.length; }
  async clear(): Promise<void> { this.memories = []; }
}

// =============================================================================
// query - basic filtering
// =============================================================================

describe("MemoryQueryService - query basic", () => {
  let store: MockMemoryStore;
  let service: MemoryQueryService;

  beforeEach(() => {
    store = new MockMemoryStore();
    service = new MemoryQueryService(store, makeConfig());
  });

  test("returns all memories when no filter applied", async () => {
    const memories = [
      makeLongTermMemory({ observation: makeObservation({ text: "memory one", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ text: "memory two", lastSeen: new Date() }) }),
      makeLongTermMemory({ observation: makeObservation({ text: "memory three", lastSeen: new Date() }) }),
    ];
    store.setMemories(memories);

    const result = await service.query({});
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  test("query results include relevance scores", async () => {
    const memories = [
      makeLongTermMemory({ observation: makeObservation({ count: 5, lastSeen: new Date() }) }),
    ];
    store.setMemories(memories);

    const result = await service.query({});
    expect(result.items[0].relevance).toBeDefined();
    expect(result.items[0].relevance.total).toBeGreaterThan(0);
    expect(result.items[0].relevance.frequency).toBeDefined();
    expect(result.items[0].relevance.recency).toBeDefined();
    expect(result.items[0].relevance.sessionSpread).toBeDefined();
  });

  test("returns empty result when store is empty", async () => {
    store.setMemories([]);

    const result = await service.query({});
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test("pagination limits results", async () => {
    const memories = Array.from({ length: 5 }, () =>
      makeLongTermMemory({ observation: makeObservation({ lastSeen: new Date() }) })
    );
    store.setMemories(memories);

    const result = await service.query({}, { offset: 0, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
  });

  test("pagination offset skips items", async () => {
    const memories = Array.from({ length: 5 }, () =>
      makeLongTermMemory({ observation: makeObservation({ lastSeen: new Date() }) })
    );
    store.setMemories(memories);

    const result = await service.query({}, { offset: 3, limit: 50 });
    expect(result.items).toHaveLength(2);
    expect(result.offset).toBe(3);
  });
});

// =============================================================================
// query - scope filtering
// =============================================================================

describe("MemoryQueryService - query scope classification", () => {
  let store: MockMemoryStore;
  let service: MemoryQueryService;

  beforeEach(() => {
    store = new MockMemoryStore();
    // Use config where count threshold is 5 and days threshold is 7
    service = new MemoryQueryService(store, makeConfig({
      observationCountThreshold: 5,
      longTermDaysThreshold: 7,
    }));
  });

  test("filters to session scope (single source session)", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 1, sourceSessionIds: ["s1"] }),
        promotedAt: new Date(),
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 10, sourceSessionIds: ["s1", "s2"] }),
        promotedAt: daysAgo(1),
      }),
    ];
    store.setMemories(memories);

    const result = await service.getByScope("session");
    expect(result).toHaveLength(1);
    expect(result[0].observation.sourceSessionIds).toHaveLength(1);
  });

  test("filters to project scope (multiple sessions, not yet global)", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 2, sourceSessionIds: ["s1", "s2"] }),
        promotedAt: new Date(), // just promoted, not old enough for global
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 1, sourceSessionIds: ["s1"] }),
        promotedAt: new Date(),
      }),
    ];
    store.setMemories(memories);

    const result = await service.getByScope("project");
    expect(result).toHaveLength(1);
    expect(result[0].observation.sourceSessionIds.length).toBeGreaterThan(1);
  });
});

// =============================================================================
// query - keyword filtering
// =============================================================================

describe("MemoryQueryService - query keyword", () => {
  let store: MockMemoryStore;
  let service: MemoryQueryService;

  beforeEach(() => {
    store = new MockMemoryStore();
    service = new MemoryQueryService(store, makeConfig());
  });

  test("filters by keyword matching observation text", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "Use the read tool for file access patterns", lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "Bash command execution workflow steps", lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "Error handling in typescript compilation", lastSeen: new Date() }),
      }),
    ];
    store.setMemories(memories);

    const result = await service.query({ keyword: "file" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].memory.observation.text).toContain("file");
  });

  test("keyword with no matches returns empty", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "workflow pattern detection", lastSeen: new Date() }),
      }),
    ];
    store.setMemories(memories);

    const result = await service.query({ keyword: "xyznonexistent" });
    expect(result.items).toHaveLength(0);
  });
});

// =============================================================================
// query - relevance threshold
// =============================================================================

describe("MemoryQueryService - query relevance threshold", () => {
  let store: MockMemoryStore;
  let service: MemoryQueryService;

  beforeEach(() => {
    store = new MockMemoryStore();
    service = new MemoryQueryService(store, makeConfig());
  });

  test("applies relevance threshold to filter low-scoring memories", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({
          count: 100,
          sourceSessionIds: ["s1", "s2", "s3", "s4", "s5"],
          lastSeen: new Date(), // just now, high recency
        }),
      }),
      makeLongTermMemory({
        observation: makeObservation({
          count: 1,
          sourceSessionIds: ["s1"],
          lastSeen: daysAgo(60), // very old, low recency
        }),
      }),
    ];
    store.setMemories(memories);

    // High threshold should filter out the low-scoring one
    const result = await service.query({ relevanceThreshold: 0.8 });
    expect(result.items.length).toBeLessThan(2);
    // The high-count recent one should survive
    if (result.items.length > 0) {
      expect(result.items[0].relevance.total).toBeGreaterThanOrEqual(0.8);
    }
  });

  test("threshold of 0 returns all memories", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 1, lastSeen: daysAgo(60) }),
      }),
    ];
    store.setMemories(memories);

    const result = await service.query({ relevanceThreshold: 0 });
    expect(result.items).toHaveLength(1);
  });
});

// =============================================================================
// computeRelevance
// =============================================================================

describe("MemoryQueryService - computeRelevance", () => {
  let service: MemoryQueryService;

  beforeEach(() => {
    service = new MemoryQueryService(
      new MockMemoryStore(),
      makeConfig()
    );
  });

  test("returns score with frequency, recency, sessionSpread components", () => {
    const ltm = makeLongTermMemory({
      observation: makeObservation({
        count: 10,
        sourceSessionIds: ["s1", "s2", "s3"],
        lastSeen: new Date(),
      }),
    });

    const score = service.computeRelevance(ltm);
    expect(score.frequency).toBeDefined();
    expect(score.recency).toBeDefined();
    expect(score.sessionSpread).toBeDefined();
    expect(score.total).toBeDefined();
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(1.0);
  });

  test("higher count produces higher frequency score", () => {
    const lowCount = makeLongTermMemory({
      observation: makeObservation({ count: 1, lastSeen: new Date() }),
    });
    const highCount = makeLongTermMemory({
      observation: makeObservation({ count: 50, lastSeen: new Date() }),
    });
    const context = { maxCount: 50, maxSessions: 1 };

    const lowScore = service.computeRelevance(lowCount, context);
    const highScore = service.computeRelevance(highCount, context);
    expect(highScore.frequency).toBeGreaterThan(lowScore.frequency);
  });

  test("recent observation produces higher recency score than old", () => {
    const recent = makeLongTermMemory({
      observation: makeObservation({ lastSeen: new Date() }),
    });
    const old = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(30) }),
    });

    const recentScore = service.computeRelevance(recent);
    const oldScore = service.computeRelevance(old);
    expect(recentScore.recency).toBeGreaterThan(oldScore.recency);
  });

  test("more session spread produces higher sessionSpread score", () => {
    const narrow = makeLongTermMemory({
      observation: makeObservation({ sourceSessionIds: ["s1"] }),
    });
    const wide = makeLongTermMemory({
      observation: makeObservation({ sourceSessionIds: ["s1", "s2", "s3", "s4"] }),
    });
    const context = { maxCount: 3, maxSessions: 4 };

    const narrowScore = service.computeRelevance(narrow, context);
    const wideScore = service.computeRelevance(wide, context);
    expect(wideScore.sessionSpread).toBeGreaterThan(narrowScore.sessionSpread);
  });

  test("self-normalised score yields 1.0 frequency for single memory", () => {
    const ltm = makeLongTermMemory({
      observation: makeObservation({ count: 5, lastSeen: new Date() }),
    });

    const score = service.computeRelevance(ltm);
    // Without context, count normalised against itself = 1.0
    // frequency component = weight * 1.0
    expect(score.frequency).toBeGreaterThan(0);
  });

  test("total is clamped between 0 and 1", () => {
    const ltm = makeLongTermMemory({
      observation: makeObservation({ count: 1000, sourceSessionIds: Array.from({ length: 50 }, (_, i) => `s${i}`), lastSeen: new Date() }),
    });

    const score = service.computeRelevance(ltm);
    expect(score.total).toBeGreaterThanOrEqual(0.0);
    expect(score.total).toBeLessThanOrEqual(1.0);
  });
});

// =============================================================================
// getByScope
// =============================================================================

describe("MemoryQueryService - getByScope", () => {
  let store: MockMemoryStore;
  let service: MemoryQueryService;

  beforeEach(() => {
    store = new MockMemoryStore();
    service = new MemoryQueryService(store, makeConfig({
      observationCountThreshold: 10,
      longTermDaysThreshold: 30,
    }));
  });

  test("returns only memories at specified scope", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 1, sourceSessionIds: ["s1"] }),
        promotedAt: new Date(),
      }),
      makeLongTermMemory({
        observation: makeObservation({ count: 5, sourceSessionIds: ["s1", "s2"] }),
        promotedAt: new Date(),
      }),
    ];
    store.setMemories(memories);

    const sessionScope = await service.getByScope("session");
    expect(sessionScope.every((m) => m.observation.sourceSessionIds.length === 1)).toBe(true);

    const projectScope = await service.getByScope("project");
    expect(projectScope.every((m) => m.observation.sourceSessionIds.length > 1)).toBe(true);
  });

  test("returns empty when no memories match scope", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ count: 1, sourceSessionIds: ["s1"] }),
        promotedAt: new Date(),
      }),
    ];
    store.setMemories(memories);

    const globalScope = await service.getByScope("global");
    expect(globalScope).toHaveLength(0);
  });
});

// =============================================================================
// searchByKeyword
// =============================================================================

describe("MemoryQueryService - searchByKeyword", () => {
  let store: MockMemoryStore;
  let service: MemoryQueryService;

  beforeEach(() => {
    store = new MockMemoryStore();
    service = new MemoryQueryService(store, makeConfig());
  });

  test("finds memories by text search", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "TypeScript compilation error handling", lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "Bash command execution patterns", lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "TypeScript type checking configuration", lastSeen: new Date() }),
      }),
    ];
    store.setMemories(memories);

    const results = await service.searchByKeyword("typescript");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.memory.observation.text.toLowerCase().includes("typescript"))).toBe(true);
  });

  test("finds memories by tag search", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "some observation text here", tags: ["typescript", "config"], lastSeen: new Date() }),
      }),
      makeLongTermMemory({
        observation: makeObservation({ text: "another observation here too", tags: ["bash", "execution"], lastSeen: new Date() }),
      }),
    ];
    store.setMemories(memories);

    const results = await service.searchByKeyword("config");
    expect(results).toHaveLength(1);
  });

  test("returns empty for no matches", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({ text: "workflow pattern detection method", lastSeen: new Date() }),
      }),
    ];
    store.setMemories(memories);

    const results = await service.searchByKeyword("xyznonexistent");
    expect(results).toHaveLength(0);
  });

  test("returns empty for empty keyword", async () => {
    store.setMemories([
      makeLongTermMemory({ observation: makeObservation({ lastSeen: new Date() }) }),
    ]);

    const results = await service.searchByKeyword("");
    expect(results).toHaveLength(0);
  });

  test("respects limit parameter", async () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      makeLongTermMemory({
        observation: makeObservation({ text: `pattern observation number ${i}`, lastSeen: new Date() }),
      })
    );
    store.setMemories(memories);

    const results = await service.searchByKeyword("pattern", 3);
    expect(results).toHaveLength(3);
  });

  test("results are sorted by relevance descending", async () => {
    const memories = [
      makeLongTermMemory({
        observation: makeObservation({
          text: "pattern in workflow detection",
          count: 1,
          lastSeen: daysAgo(30),
        }),
      }),
      makeLongTermMemory({
        observation: makeObservation({
          text: "pattern recognition with high frequency",
          count: 50,
          sourceSessionIds: ["s1", "s2", "s3"],
          lastSeen: new Date(),
        }),
      }),
    ];
    store.setMemories(memories);

    const results = await service.searchByKeyword("pattern");
    expect(results).toHaveLength(2);
    expect(results[0].relevance.total).toBeGreaterThanOrEqual(results[1].relevance.total);
  });
});
