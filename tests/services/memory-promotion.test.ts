/**
 * Tests for services/memory-promotion.ts
 *
 * Validates MemoryPromotionService: observation-to-long-term promotions,
 * long-term-to-core promotions, dry-run previews, and event logging.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryPromotionService } from "../../src/services/memory-promotion.ts";
import type { Observation, LongTermMemory, Config } from "../../src/core/types.ts";
import type { IObservationStore, IMemoryStore, PromotionResult } from "../../src/storage/interfaces.ts";

// =============================================================================
// Test Helpers
// =============================================================================

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    text: overrides.text ?? "test observation pattern",
    category: overrides.category ?? "pattern",
    count: overrides.count ?? 5,
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

function makeConfig(overrides: {
  observationCountThreshold?: number;
  longTermDaysThreshold?: number;
  claudeMd?: boolean;
  agentsMd?: boolean;
} = {}): Config {
  return {
    version: "1.0.0",
    llmAdapter: { type: "claude-code" },
    sessionAdapters: { claudeCode: true, opencode: false },
    memoryTargets: {
      claudeMd: overrides.claudeMd ?? true,
      agentsMd: overrides.agentsMd ?? false,
    },
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
// Mock Stores
// =============================================================================

class MockObservationStore implements IObservationStore {
  private observations: Map<string, Observation> = new Map();
  private promotable: Observation[] = [];

  setPromotable(obs: Observation[]): void {
    this.promotable = obs;
    for (const o of obs) {
      this.observations.set(o.id, o);
    }
  }

  setObservation(obs: Observation): void {
    this.observations.set(obs.id, obs);
  }

  async getPromotable(): Promise<Observation[]> {
    return [...this.promotable];
  }

  async getByStatus(status: string): Promise<Observation[]> {
    return [...this.observations.values()].filter((o) => o.status === status);
  }

  async setStatus(id: string, status: Observation["status"]): Promise<Observation> {
    const obs = this.observations.get(id);
    if (!obs) throw new Error(`Observation ${id} not found`);
    obs.status = status;
    this.observations.set(id, obs);
    return obs;
  }

  async getAll(): Promise<Observation[]> {
    return [...this.observations.values()];
  }

  async getById(id: string): Promise<Observation | null> {
    return this.observations.get(id) ?? null;
  }

  // Stub implementations to satisfy interface
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
  async incrementCount(id: string): Promise<Observation> { return this.observations.get(id)!; }
  async updateLastSeen(id: string): Promise<Observation> { return this.observations.get(id)!; }
  async addSessionRef(id: string): Promise<Observation> { return this.observations.get(id)!; }
  async update(id: string, partial: any): Promise<Observation> { return this.observations.get(id)!; }
  async bulkUpdate(): Promise<Observation[]> { return []; }
  async delete(id: string): Promise<boolean> { return this.observations.delete(id); }
  async deleteByStatus(): Promise<number> { return 0; }
  async findSimilar(): Promise<Observation | null> { return null; }
}

class MockMemoryStore implements IMemoryStore {
  private memories: Map<string, LongTermMemory> = new Map();
  private promotableToCore: LongTermMemory[] = [];
  private promotionResults: Map<string, PromotionResult> = new Map();

  setMemory(mem: LongTermMemory): void {
    this.memories.set(mem.id, mem);
  }

  setPromotableToCore(memories: LongTermMemory[]): void {
    this.promotableToCore = memories;
    for (const m of memories) {
      this.memories.set(m.id, m);
    }
  }

  setPromotionResult(observationId: string, result: PromotionResult): void {
    this.promotionResults.set(observationId, result);
  }

  async promoteToLongTerm(observationId: string): Promise<PromotionResult> {
    const custom = this.promotionResults.get(observationId);
    if (custom) return custom;
    return { success: true, id: crypto.randomUUID() };
  }

  async promoteToCore(memoryId: string, targets: string[]): Promise<PromotionResult> {
    const custom = this.promotionResults.get(memoryId);
    if (custom) return custom;
    return { success: true, id: crypto.randomUUID() };
  }

  async getAll(): Promise<LongTermMemory[]> {
    return [...this.memories.values()];
  }

  async getById(id: string): Promise<LongTermMemory | null> {
    return this.memories.get(id) ?? null;
  }

  async query(): Promise<LongTermMemory[]> {
    return [...this.memories.values()];
  }

  async getPromotableToCore(): Promise<LongTermMemory[]> {
    return [...this.promotableToCore];
  }

  async getCounts(): Promise<{ pending: number; longTerm: number; core: number }> {
    return { pending: 0, longTerm: this.memories.size, core: 0 };
  }

  isEligibleForCorePromotion(memory: LongTermMemory): boolean {
    return memory.observation.count >= 3;
  }

  daysSinceLongTermPromotion(memory: LongTermMemory): number {
    const ms = Date.now() - memory.promotedAt.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  async setStatus(id: string, status: LongTermMemory["status"]): Promise<LongTermMemory> {
    const mem = this.memories.get(id);
    if (!mem) throw new Error(`Memory ${id} not found`);
    mem.status = status;
    return mem;
  }

  async delete(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  async load(): Promise<void> {}
  async save(): Promise<void> {}
  async count(): Promise<number> { return this.memories.size; }
  async clear(): Promise<void> { this.memories.clear(); }
}

// =============================================================================
// checkAndPromoteObservations
// =============================================================================

describe("MemoryPromotionService - checkAndPromoteObservations", () => {
  let obsStore: MockObservationStore;
  let memStore: MockMemoryStore;
  let service: MemoryPromotionService;

  beforeEach(() => {
    obsStore = new MockObservationStore();
    memStore = new MockMemoryStore();
    service = new MemoryPromotionService(
      obsStore,
      memStore,
      makeConfig({ observationCountThreshold: 3 })
    );
  });

  test("promotes approved observations meeting count threshold", async () => {
    const obs = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs]);

    const result = await service.checkAndPromoteObservations();
    expect(result.promoted).toBe(1);
    expect(result.evaluated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].success).toBe(true);
    expect(result.events[0].level).toBe("observation-to-long-term");
    expect(result.events[0].sourceId).toBe(obs.id);
  });

  test("skips pending observations", async () => {
    const pendingObs = makeObservation({ count: 10, status: "pending" });
    obsStore.setObservation(pendingObs);
    // Not in promotable (getPromotable only returns approved)
    obsStore.setPromotable([]);

    const result = await service.checkAndPromoteObservations();
    expect(result.promoted).toBe(0);
    expect(result.evaluated).toBe(0);
  });

  test("skips denied observations", async () => {
    const deniedObs = makeObservation({ count: 10, status: "denied" });
    obsStore.setObservation(deniedObs);
    obsStore.setPromotable([]);

    const result = await service.checkAndPromoteObservations();
    expect(result.promoted).toBe(0);
    expect(result.evaluated).toBe(0);
  });

  test("handles empty observation list", async () => {
    obsStore.setPromotable([]);

    const result = await service.checkAndPromoteObservations();
    expect(result.evaluated).toBe(0);
    expect(result.promoted).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("records failed promotions", async () => {
    const obs = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs]);
    memStore.setPromotionResult(obs.id, {
      success: false,
      reason: "Store error: duplicate key",
    });

    const result = await service.checkAndPromoteObservations();
    expect(result.failed).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.events[0].success).toBe(false);
    expect(result.events[0].reason).toContain("duplicate key");
  });

  test("promotes observations with 5+ source sessions (project-level rule)", async () => {
    // This observation has 5 sessions but count below threshold
    const obs = makeObservation({
      count: 1,
      status: "approved",
      sourceSessionIds: ["s1", "s2", "s3", "s4", "s5"],
    });
    // Not in promotable (count < threshold), but qualifies via project-level rule
    obsStore.setPromotable([]);
    obsStore.setObservation(obs);

    const result = await service.checkAndPromoteObservations();
    expect(result.promoted).toBe(1);
    expect(result.evaluated).toBe(1);
  });

  test("does not promote observations with fewer than 5 sessions and low count", async () => {
    const obs = makeObservation({
      count: 1,
      status: "approved",
      sourceSessionIds: ["s1", "s2"],
    });
    obsStore.setPromotable([]);
    obsStore.setObservation(obs);

    const result = await service.checkAndPromoteObservations();
    expect(result.promoted).toBe(0);
  });
});

// =============================================================================
// checkAndPromoteToCore
// =============================================================================

describe("MemoryPromotionService - checkAndPromoteToCore", () => {
  let obsStore: MockObservationStore;
  let memStore: MockMemoryStore;
  let service: MemoryPromotionService;

  beforeEach(() => {
    obsStore = new MockObservationStore();
    memStore = new MockMemoryStore();
    service = new MemoryPromotionService(
      obsStore,
      memStore,
      makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7, claudeMd: true })
    );
  });

  test("promotes eligible long-term memories", async () => {
    const obs = makeObservation({ count: 10 });
    obsStore.setObservation(obs);
    const ltm = makeLongTermMemory({
      observation: obs,
      promotedAt: daysAgo(30),
    });
    memStore.setPromotableToCore([ltm]);

    const result = await service.checkAndPromoteToCore();
    expect(result.promoted).toBe(1);
    expect(result.events[0].success).toBe(true);
    expect(result.events[0].level).toBe("long-term-to-core");
  });

  test("skips memories not meeting eligibility (store reports ineligible)", async () => {
    const obs = makeObservation({ count: 1 }); // Below count threshold
    obsStore.setObservation(obs);
    const ltm = makeLongTermMemory({ observation: obs, promotedAt: daysAgo(30) });
    memStore.setPromotableToCore([ltm]);

    // Our mock returns false for count < 3
    const result = await service.checkAndPromoteToCore();
    expect(result.promoted).toBe(0);
  });

  test("handles empty promotable memory list", async () => {
    memStore.setPromotableToCore([]);

    const result = await service.checkAndPromoteToCore();
    expect(result.evaluated).toBe(0);
    expect(result.promoted).toBe(0);
    expect(result.failed).toBe(0);
  });

  test("records failed core promotions", async () => {
    const obs = makeObservation({ count: 10 });
    obsStore.setObservation(obs);
    const ltm = makeLongTermMemory({ observation: obs, promotedAt: daysAgo(30) });
    memStore.setPromotableToCore([ltm]);
    memStore.setPromotionResult(ltm.id, {
      success: false,
      reason: "File write permission denied",
    });

    const result = await service.checkAndPromoteToCore();
    expect(result.failed).toBe(1);
    expect(result.events[0].success).toBe(false);
    expect(result.events[0].reason).toContain("permission denied");
  });

  test("skips when no memory targets configured", async () => {
    const noTargetsService = new MemoryPromotionService(
      obsStore,
      memStore,
      makeConfig({ claudeMd: false, agentsMd: false })
    );
    const obs = makeObservation({ count: 10 });
    obsStore.setObservation(obs);
    const ltm = makeLongTermMemory({ observation: obs, promotedAt: daysAgo(30) });
    memStore.setPromotableToCore([ltm]);

    const result = await noTargetsService.checkAndPromoteToCore();
    expect(result.failed).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.events[0].reason).toContain("No memory targets configured");
  });
});

// =============================================================================
// getPromotionCandidates (dry-run preview)
// =============================================================================

describe("MemoryPromotionService - getPromotionCandidates", () => {
  let obsStore: MockObservationStore;
  let memStore: MockMemoryStore;
  let service: MemoryPromotionService;

  beforeEach(() => {
    obsStore = new MockObservationStore();
    memStore = new MockMemoryStore();
    service = new MemoryPromotionService(
      obsStore,
      memStore,
      makeConfig({ observationCountThreshold: 3 })
    );
  });

  test("returns preview of what would be promoted", async () => {
    const obs = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs]);

    const ltmObs = makeObservation({ count: 10 });
    const ltm = makeLongTermMemory({ observation: ltmObs, promotedAt: daysAgo(30) });
    memStore.setPromotableToCore([ltm]);

    const candidates = await service.getPromotionCandidates();
    expect(candidates.observationCandidates).toHaveLength(1);
    expect(candidates.longTermCandidates).toHaveLength(1);
    expect(candidates.evaluatedAt).toBeInstanceOf(Date);
    expect(candidates.observationCandidates[0].reason).toBeDefined();
    expect(candidates.longTermCandidates[0].reason).toBeDefined();
  });

  test("excludes non-eligible observations from preview", async () => {
    const pendingObs = makeObservation({ count: 1, status: "pending" });
    obsStore.setPromotable([pendingObs]);

    const candidates = await service.getPromotionCandidates();
    expect(candidates.observationCandidates).toHaveLength(0);
  });

  test("marks project-level observations in preview", async () => {
    const obs = makeObservation({
      count: 100,
      status: "approved",
      sourceSessionIds: ["s1", "s2", "s3", "s4", "s5", "s6"],
    });
    obsStore.setPromotable([obs]);

    const candidates = await service.getPromotionCandidates();
    expect(candidates.observationCandidates).toHaveLength(1);
    expect(candidates.observationCandidates[0].isProjectLevel).toBe(true);
    expect(candidates.observationCandidates[0].reason).toContain("sessions");
  });
});

// =============================================================================
// Promotion Event Logging
// =============================================================================

describe("MemoryPromotionService - event logging", () => {
  let obsStore: MockObservationStore;
  let memStore: MockMemoryStore;
  let service: MemoryPromotionService;

  beforeEach(() => {
    obsStore = new MockObservationStore();
    memStore = new MockMemoryStore();
    service = new MemoryPromotionService(
      obsStore,
      memStore,
      makeConfig()
    );
  });

  test("getPromotionLog returns accumulated events", async () => {
    const obs = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs]);

    await service.checkAndPromoteObservations();
    const log = service.getPromotionLog();

    expect(log).toHaveLength(1);
    expect(log[0].eventId).toBe(1);
    expect(log[0].timestamp).toBeInstanceOf(Date);
    expect(log[0].level).toBe("observation-to-long-term");
  });

  test("getPromotionLog accumulates across multiple runs", async () => {
    const obs1 = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs1]);

    await service.checkAndPromoteObservations();

    const obs2 = makeObservation({ count: 7, status: "approved" });
    obsStore.setPromotable([obs2]);

    await service.checkAndPromoteObservations();

    const log = service.getPromotionLog();
    expect(log).toHaveLength(2);
    expect(log[0].eventId).toBe(1);
    expect(log[1].eventId).toBe(2);
  });

  test("clearPromotionLog resets the log", async () => {
    const obs = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs]);

    await service.checkAndPromoteObservations();
    expect(service.getPromotionLog()).toHaveLength(1);

    service.clearPromotionLog();
    expect(service.getPromotionLog()).toHaveLength(0);
  });

  test("clearPromotionLog resets event counter", async () => {
    const obs = makeObservation({ count: 5, status: "approved" });
    obsStore.setPromotable([obs]);

    await service.checkAndPromoteObservations();
    service.clearPromotionLog();

    obsStore.setPromotable([makeObservation({ count: 4, status: "approved" })]);
    await service.checkAndPromoteObservations();

    const log = service.getPromotionLog();
    expect(log[0].eventId).toBe(1);
  });
});
