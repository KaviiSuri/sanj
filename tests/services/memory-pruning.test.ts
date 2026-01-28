/**
 * Tests for services/memory-pruning.ts
 *
 * Validates MemoryPruningService: stale/low-significance/denied pruning,
 * dry-run mode, manual pruneById, and preview methods.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryPruningService } from "../../src/services/memory-pruning.ts";
import type { LongTermMemory, Observation } from "../../src/core/types.ts";
import type { IMemoryStore, IObservationStore } from "../../src/storage/interfaces.ts";

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

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// =============================================================================
// Mock Stores
// =============================================================================

class MockMemoryStore implements IMemoryStore {
  private memories: Map<string, LongTermMemory> = new Map();
  private deletedIds: string[] = [];

  setMemories(memories: LongTermMemory[]): void {
    this.memories = new Map(memories.map((m) => [m.id, m]));
  }

  getDeletedIds(): string[] {
    return [...this.deletedIds];
  }

  async getAll(): Promise<LongTermMemory[]> {
    return [...this.memories.values()];
  }

  async getById(id: string): Promise<LongTermMemory | null> {
    return this.memories.get(id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.memories.has(id);
    this.memories.delete(id);
    if (existed) this.deletedIds.push(id);
    return existed;
  }

  async query(): Promise<LongTermMemory[]> { return [...this.memories.values()]; }
  async getPromotableToCore(): Promise<LongTermMemory[]> { return []; }
  async getCounts(): Promise<any> { return { pending: 0, longTerm: this.memories.size, core: 0 }; }
  isEligibleForCorePromotion(): boolean { return false; }
  daysSinceLongTermPromotion(): number { return 0; }
  async setStatus(id: string, status: any): Promise<LongTermMemory> {
    const mem = this.memories.get(id)!;
    mem.status = status;
    return mem;
  }
  async promoteToLongTerm(): Promise<any> { return { success: true }; }
  async promoteToCore(): Promise<any> { return { success: true }; }
  async load(): Promise<void> {}
  async save(): Promise<void> {}
  async count(): Promise<number> { return this.memories.size; }
  async clear(): Promise<void> { this.memories.clear(); }
}

class MockObservationStore implements IObservationStore {
  private observations: Map<string, Observation> = new Map();
  private deletedIds: string[] = [];

  setObservations(observations: Observation[]): void {
    this.observations = new Map(observations.map((o) => [o.id, o]));
  }

  getDeletedIds(): string[] {
    return [...this.deletedIds];
  }

  async getAll(): Promise<Observation[]> {
    return [...this.observations.values()];
  }

  async getById(id: string): Promise<Observation | null> {
    return this.observations.get(id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.observations.has(id);
    this.observations.delete(id);
    if (existed) this.deletedIds.push(id);
    return existed;
  }

  async setStatus(id: string, status: Observation["status"]): Promise<Observation> {
    const obs = this.observations.get(id)!;
    obs.status = status;
    return obs;
  }

  async getByStatus(status: string): Promise<Observation[]> {
    return [...this.observations.values()].filter((o) => o.status === status);
  }

  // Stubs to satisfy interface
  async load(): Promise<void> {}
  async save(): Promise<void> {}
  async count(): Promise<number> { return this.observations.size; }
  async clear(): Promise<void> { this.observations.clear(); }
  async create(obs: any): Promise<Observation> { return obs; }
  async bulkCreate(obs: any[]): Promise<Observation[]> { return obs; }
  async getPending(): Promise<Observation[]> { return []; }
  async getApproved(): Promise<Observation[]> { return []; }
  async getDenied(): Promise<Observation[]> { return []; }
  async query(): Promise<Observation[]> { return []; }
  async filter(): Promise<Observation[]> { return []; }
  async incrementCount(): Promise<Observation> { return {} as any; }
  async updateLastSeen(): Promise<Observation> { return {} as any; }
  async addSessionRef(): Promise<Observation> { return {} as any; }
  async update(): Promise<Observation> { return {} as any; }
  async bulkUpdate(): Promise<Observation[]> { return []; }
  async deleteByStatus(): Promise<number> { return 0; }
  async findSimilar(): Promise<Observation | null> { return null; }
  async getPromotable(): Promise<Observation[]> { return []; }
}

// =============================================================================
// pruneMemories - stale memories
// =============================================================================

describe("MemoryPruningService - pruneMemories stale", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("removes stale memories (lastSeen > staleDays)", async () => {
    const staleMemory = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(100), text: "stale pattern" }),
      status: "approved",
    });
    const freshMemory = makeLongTermMemory({
      observation: makeObservation({ lastSeen: new Date(), text: "fresh pattern" }),
      status: "approved",
    });
    memStore.setMemories([staleMemory, freshMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].reason).toBe("stale");
    expect(result.pruned[0].id).toBe(staleMemory.id);
    expect(result.totalEvaluated).toBe(2);
    expect(result.isDryRun).toBe(false);
    expect(memStore.getDeletedIds()).toContain(staleMemory.id);
  });

  test("keeps memories whose lastSeen is within staleDays", async () => {
    const recentMemory = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(10) }),
      status: "approved",
    });
    memStore.setMemories([recentMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(0);
    expect(memStore.getDeletedIds()).toHaveLength(0);
  });
});

// =============================================================================
// pruneMemories - low significance
// =============================================================================

describe("MemoryPruningService - pruneMemories low significance", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("removes memories with count below minRetainCount", async () => {
    const lowCount = makeLongTermMemory({
      observation: makeObservation({ count: 1, lastSeen: daysAgo(5) }),
      status: "approved",
    });
    const highCount = makeLongTermMemory({
      observation: makeObservation({ count: 5, lastSeen: daysAgo(5) }),
      status: "approved",
    });
    memStore.setMemories([lowCount, highCount]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 3,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].reason).toBe("low-significance");
    expect(result.pruned[0].count).toBe(1);
    expect(memStore.getDeletedIds()).toContain(lowCount.id);
  });

  test("keeps memories at exactly minRetainCount", async () => {
    const atThreshold = makeLongTermMemory({
      observation: makeObservation({ count: 3, lastSeen: daysAgo(5) }),
      status: "approved",
    });
    memStore.setMemories([atThreshold]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 3,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(0);
  });
});

// =============================================================================
// pruneMemories - denied memories
// =============================================================================

describe("MemoryPruningService - pruneMemories denied", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("removes denied memories when pruneDenied is true", async () => {
    const deniedMemory = makeLongTermMemory({
      observation: makeObservation({ count: 10, lastSeen: new Date() }),
      status: "denied",
    });
    const approvedMemory = makeLongTermMemory({
      observation: makeObservation({ count: 10, lastSeen: new Date() }),
      status: "approved",
    });
    memStore.setMemories([deniedMemory, approvedMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: true,
      dryRun: false,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].reason).toBe("denied");
    expect(result.pruned[0].id).toBe(deniedMemory.id);
    expect(memStore.getDeletedIds()).toContain(deniedMemory.id);
  });

  test("keeps denied memories when pruneDenied is false", async () => {
    const deniedMemory = makeLongTermMemory({
      observation: makeObservation({ count: 10, lastSeen: new Date() }),
      status: "denied",
    });
    memStore.setMemories([deniedMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(0);
    expect(memStore.getDeletedIds()).toHaveLength(0);
  });
});

// =============================================================================
// pruneMemories - dryRun mode
// =============================================================================

describe("MemoryPruningService - pruneMemories dryRun", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("dryRun mode does not actually delete memories", async () => {
    const staleMemory = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(100) }),
      status: "approved",
    });
    memStore.setMemories([staleMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: true,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(1);
    expect(result.isDryRun).toBe(true);
    // Nothing actually deleted
    expect(memStore.getDeletedIds()).toHaveLength(0);
  });

  test("dryRun still reports what would be pruned", async () => {
    const deniedMemory = makeLongTermMemory({
      observation: makeObservation({ count: 5, lastSeen: new Date() }),
      status: "denied",
    });
    memStore.setMemories([deniedMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: true,
      dryRun: true,
    });

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].reason).toBe("denied");
  });
});

// =============================================================================
// pruneById
// =============================================================================

describe("MemoryPruningService - pruneById", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("removes specific memory by id", async () => {
    const targetId = crypto.randomUUID();
    const memory = makeLongTermMemory({
      id: targetId,
      observation: makeObservation({ text: "target memory", count: 5 }),
    });
    memStore.setMemories([memory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneById(targetId);
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].id).toBe(targetId);
    expect(result.pruned[0].reason).toBe("manual");
    expect(memStore.getDeletedIds()).toContain(targetId);
  });

  test("returns empty result when memory not found", async () => {
    memStore.setMemories([]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.pruneById("nonexistent-id");
    expect(result.pruned).toHaveLength(0);
    expect(result.totalEvaluated).toBe(1);
  });

  test("pruneById in dryRun mode does not delete", async () => {
    const targetId = crypto.randomUUID();
    const memory = makeLongTermMemory({ id: targetId });
    memStore.setMemories([memory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: true,
    });

    const result = await service.pruneById(targetId);
    expect(result.pruned).toHaveLength(1);
    expect(result.isDryRun).toBe(true);
    expect(memStore.getDeletedIds()).toHaveLength(0);
  });
});

// =============================================================================
// getStaleMemories
// =============================================================================

describe("MemoryPruningService - getStaleMemories", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("returns preview of stale memories without deletion", async () => {
    const stale = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(100), text: "old pattern" }),
    });
    const fresh = makeLongTermMemory({
      observation: makeObservation({ lastSeen: new Date(), text: "new pattern" }),
    });
    memStore.setMemories([stale, fresh]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.getStaleMemories();
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("stale");
    expect(result[0].id).toBe(stale.id);
    expect(result[0].daysSinceLastSeen).toBeGreaterThan(90);
    // Nothing deleted
    expect(memStore.getDeletedIds()).toHaveLength(0);
  });

  test("returns empty when no stale memories exist", async () => {
    memStore.setMemories([
      makeLongTermMemory({ observation: makeObservation({ lastSeen: daysAgo(10) }) }),
    ]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.getStaleMemories();
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// getLowSignificanceMemories
// =============================================================================

describe("MemoryPruningService - getLowSignificanceMemories", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("returns preview of low-significance memories without deletion", async () => {
    const lowSig = makeLongTermMemory({
      observation: makeObservation({ count: 1, text: "rare pattern" }),
    });
    const highSig = makeLongTermMemory({
      observation: makeObservation({ count: 10, text: "common pattern" }),
    });
    memStore.setMemories([lowSig, highSig]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 5,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.getLowSignificanceMemories();
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("low-significance");
    expect(result[0].count).toBe(1);
    // Nothing deleted
    expect(memStore.getDeletedIds()).toHaveLength(0);
  });

  test("returns empty when all memories meet threshold", async () => {
    memStore.setMemories([
      makeLongTermMemory({ observation: makeObservation({ count: 10 }) }),
      makeLongTermMemory({ observation: makeObservation({ count: 5 }) }),
    ]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 3,
      pruneDenied: false,
      dryRun: false,
    });

    const result = await service.getLowSignificanceMemories();
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// getDryRunReport
// =============================================================================

describe("MemoryPruningService - getDryRunReport", () => {
  let memStore: MockMemoryStore;
  let obsStore: MockObservationStore;

  beforeEach(() => {
    memStore = new MockMemoryStore();
    obsStore = new MockObservationStore();
  });

  test("always returns isDryRun true regardless of config", async () => {
    // Even with dryRun: false in config, getDryRunReport forces isDryRun: true
    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: false,
      dryRun: false,
    });

    memStore.setMemories([]);
    const result = await service.getDryRunReport();
    expect(result.isDryRun).toBe(true);
  });

  test("reports all prunable memories including stale and denied", async () => {
    const staleMemory = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(100) }),
      status: "approved",
    });
    const deniedMemory = makeLongTermMemory({
      observation: makeObservation({ lastSeen: new Date(), count: 10 }),
      status: "denied",
    });
    memStore.setMemories([staleMemory, deniedMemory]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: true,
      dryRun: false,
    });

    const result = await service.getDryRunReport();
    expect(result.pruned).toHaveLength(2);
    expect(result.isDryRun).toBe(true);
    expect(memStore.getDeletedIds()).toHaveLength(0); // Nothing deleted
  });

  test("getDryRunReport with empty store returns empty pruned list", async () => {
    memStore.setMemories([]);

    const service = new MemoryPruningService(memStore, obsStore, {
      staleDays: 90,
      minRetainCount: 1,
      pruneDenied: true,
      dryRun: false,
    });

    const result = await service.getDryRunReport();
    expect(result.pruned).toHaveLength(0);
    expect(result.totalEvaluated).toBe(0);
    expect(result.isDryRun).toBe(true);
  });
});

// =============================================================================
// Default configuration behavior
// =============================================================================

describe("MemoryPruningService - default config", () => {
  test("uses sensible defaults when config is omitted", async () => {
    const memStore = new MockMemoryStore();
    const obsStore = new MockObservationStore();

    // No config provided - should use defaults
    const service = new MemoryPruningService(memStore, obsStore);

    // Stale memory (>90 days default)
    const stale = makeLongTermMemory({
      observation: makeObservation({ lastSeen: daysAgo(100), count: 5 }),
      status: "approved",
    });
    memStore.setMemories([stale]);

    const result = await service.pruneMemories();
    expect(result.pruned).toHaveLength(1);
    expect(result.pruned[0].reason).toBe("stale");
  });
});
