/**
 * MemoryHierarchy Unit Tests
 *
 * Comprehensive coverage for the promotion logic between memory levels:
 * - Observation → Long-Term promotion with threshold validation
 * - Long-Term → Core promotion with count + time checks
 * - Query methods (getPromotableToCore, getLongTermMemories, getCounts)
 * - Deny/reject operations
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { MemoryHierarchy, DEFAULT_THRESHOLDS, type PromotionThresholds } from "../../src/core/MemoryHierarchy.ts";
import type { Observation, LongTermMemory } from "../../src/core/types.ts";
import type { CoreMemoryAdapter } from "../../src/adapters/memory/CoreMemoryAdapter.ts";

// =============================================================================
// Mock Implementations
// =============================================================================

class MockObservationStore {
  private observations = new Map<string, Observation>();

  async getById(id: string): Promise<Observation | null> {
    return this.observations.get(id) ?? null;
  }

  async setStatus(id: string, status: Observation["status"]): Promise<Observation> {
    let obs = this.observations.get(id);
    if (!obs) {
      // Create a placeholder for tests where the observation wasn't explicitly seeded
      obs = { id, text: "placeholder", count: 1, status, sourceSessionIds: [], firstSeen: new Date(), lastSeen: new Date() };
      this.observations.set(id, obs);
    }
    obs.status = status;
    return obs;
  }

  async getPending(): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter((o) => o.status === "pending");
  }

  // Test helper to seed observations
  _set(obs: Observation) {
    this.observations.set(obs.id, obs);
  }
}

class MockMemoryStore {
  private memories = new Map<string, LongTermMemory>();
  promoteToLongTermCalled: { observationId: string }[] = [];

  async promoteToLongTerm(observationId: string): Promise<{ success: boolean; id?: string; reason?: string }> {
    this.promoteToLongTermCalled.push({ observationId });
    // Check if observation store has it (simulate validation)
    const id = crypto.randomUUID();
    const memory: LongTermMemory = {
      id,
      observation: { id: observationId, text: "test", count: 3, status: "approved", sourceSessionIds: ["s1"], firstSeen: new Date(), lastSeen: new Date() },
      promotedAt: new Date(),
      status: "approved",
    };
    this.memories.set(id, memory);
    return { success: true, id };
  }

  async getById(id: string): Promise<LongTermMemory | null> {
    return this.memories.get(id) ?? null;
  }

  async getAll(): Promise<LongTermMemory[]> {
    return Array.from(this.memories.values());
  }

  async getPromotableToCore(): Promise<LongTermMemory[]> {
    return Array.from(this.memories.values()).filter((m) => this.isEligibleForCorePromotion(m));
  }

  isEligibleForCorePromotion(memory: LongTermMemory): boolean {
    return memory.observation.count >= 3 && this.daysSinceLongTermPromotion(memory) >= 7;
  }

  daysSinceLongTermPromotion(memory: LongTermMemory): number {
    return Math.floor((Date.now() - memory.promotedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  async getCounts(): Promise<{ pending: number; longTerm: number; core: number }> {
    let longTerm = 0;
    let core = 0;
    for (const m of this.memories.values()) {
      if (m.status === "scheduled-for-core") core++;
      else longTerm++;
    }
    return { pending: 0, longTerm, core };
  }

  async setStatus(id: string, status: LongTermMemory["status"]): Promise<LongTermMemory> {
    const memory = this.memories.get(id);
    if (!memory) throw new Error(`Memory not found: ${id}`);
    memory.status = status;
    return memory;
  }

  async delete(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  // Test helper to seed memories
  _set(memory: LongTermMemory) {
    this.memories.set(memory.id, memory);
  }
}

class MockCoreMemoryAdapter implements CoreMemoryAdapter {
  name: string;
  appendCalls: string[] = [];
  readResult = "";
  shouldThrowOnAppend = false;

  constructor(name: string, private readonly filePath: string) {
    this.name = name;
  }

  getPath(): string {
    return this.filePath;
  }

  async read(): Promise<string> {
    return this.readResult;
  }

  async append(content: string): Promise<void> {
    if (this.shouldThrowOnAppend) {
      throw new Error(`Failed to write to ${this.name}`);
    }
    this.appendCalls.push(content);
  }
}

// =============================================================================
// Test Helpers
// =============================================================================

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: crypto.randomUUID(),
    text: "Test observation pattern",
    count: 3,
    status: "pending",
    sourceSessionIds: ["session-1", "session-2"],
    firstSeen: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    lastSeen: new Date(),
    ...overrides,
  };
}

function makeMemory(overrides: Partial<LongTermMemory> = {}): LongTermMemory {
  return {
    id: crypto.randomUUID(),
    observation: makeObservation({ count: 5 }),
    promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
    status: "approved",
    ...overrides,
  };
}

function createHierarchy(options: {
  observations?: Observation[];
  memories?: LongTermMemory[];
  thresholds?: PromotionThresholds;
  claudeAdapterThrows?: boolean;
  agentsAdapterThrows?: boolean;
} = {}) {
  const obsStore = new MockObservationStore();
  const memStore = new MockMemoryStore();

  for (const obs of options.observations ?? []) {
    obsStore._set(obs);
  }
  for (const mem of options.memories ?? []) {
    memStore._set(mem);
  }

  const claudeAdapter = new MockCoreMemoryAdapter("claude-md", "/home/.claude/CLAUDE.md");
  const agentsAdapter = new MockCoreMemoryAdapter("agents-md", "/home/AGENTS.md");

  if (options.claudeAdapterThrows) claudeAdapter.shouldThrowOnAppend = true;
  if (options.agentsAdapterThrows) agentsAdapter.shouldThrowOnAppend = true;

  const hierarchy = new MemoryHierarchy({
    observationStore: obsStore as any,
    memoryStore: memStore as any,
    coreMemoryAdapters: [claudeAdapter, agentsAdapter],
    thresholds: options.thresholds,
  });

  return { hierarchy, obsStore, memStore, claudeAdapter, agentsAdapter };
}

// =============================================================================
// Tests
// =============================================================================

describe("MemoryHierarchy", () => {
  describe("Observation → Long-Term Promotion", () => {
    it("should promote a pending observation with sufficient count", async () => {
      const obs = makeObservation({ count: 3, status: "pending" });
      const { hierarchy, obsStore } = createHierarchy({ observations: [obs] });

      const result = await hierarchy.promoteToLongTerm(obs.id);

      expect(result.success).toBe(true);
      expect(result.memoryId).toBeDefined();
    });

    it("should reject promotion when count is below threshold", async () => {
      const obs = makeObservation({ count: 1, status: "pending" });
      const { hierarchy } = createHierarchy({ observations: [obs] });

      const result = await hierarchy.promoteToLongTerm(obs.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("Count too low");
    });

    it("should return failure for non-existent observation", async () => {
      const { hierarchy } = createHierarchy();

      const result = await hierarchy.promoteToLongTerm("non-existent-id");

      expect(result.success).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("should use custom thresholds when provided", async () => {
      const obs = makeObservation({ count: 2, status: "pending" });
      const thresholds: PromotionThresholds = {
        ...DEFAULT_THRESHOLDS,
        observationToLongTerm: { minCount: 5, requiresApproval: true },
      };
      const { hierarchy } = createHierarchy({ observations: [obs], thresholds });

      const result = await hierarchy.promoteToLongTerm(obs.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("2/5");
    });

    it("should promote observation with exactly minimum count", async () => {
      const obs = makeObservation({ count: 2, status: "pending" });
      const { hierarchy } = createHierarchy({ observations: [obs] });

      const result = await hierarchy.promoteToLongTerm(obs.id);

      expect(result.success).toBe(true);
    });

    it("should handle already-approved observation", async () => {
      const obs = makeObservation({ count: 3, status: "approved" });
      const { hierarchy } = createHierarchy({ observations: [obs] });

      const result = await hierarchy.promoteToLongTerm(obs.id);

      expect(result.success).toBe(true);
    });
  });

  describe("Long-Term → Core Promotion", () => {
    it("should promote eligible memory to core and write to adapters", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const { hierarchy, claudeAdapter, agentsAdapter } = createHierarchy({ memories: [memory] });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(true);
      expect(result.writtenTo).toBeDefined();
      expect(result.writtenTo!.length).toBe(2);
      expect(claudeAdapter.appendCalls.length).toBe(1);
      expect(agentsAdapter.appendCalls.length).toBe(1);
    });

    it("should reject promotion when count is below core threshold", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 2 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const { hierarchy } = createHierarchy({ memories: [memory] });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("Count too low");
    });

    it("should reject promotion when not enough time in long-term", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Only 2 days
      });
      const { hierarchy } = createHierarchy({ memories: [memory] });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("Not enough time");
    });

    it("should return failure for non-existent memory", async () => {
      const { hierarchy } = createHierarchy();

      const result = await hierarchy.promoteToCore("non-existent-id");

      expect(result.success).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("should handle adapter write failure gracefully", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const { hierarchy } = createHierarchy({
        memories: [memory],
        claudeAdapterThrows: true,
        agentsAdapterThrows: true,
      });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("Failed to write");
    });

    it("should succeed with partial adapter failures", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const { hierarchy, agentsAdapter } = createHierarchy({
        memories: [memory],
        claudeAdapterThrows: true, // claude fails
        // agents succeeds
      });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(true);
      expect(result.writtenTo!.length).toBe(1);
      expect(agentsAdapter.appendCalls.length).toBe(1);
    });

    it("should write formatted markdown content to adapters", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5, text: "Always use TypeScript strict mode" }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const { hierarchy, claudeAdapter } = createHierarchy({ memories: [memory] });

      await hierarchy.promoteToCore(memory.id);

      const written = claudeAdapter.appendCalls[0]!;
      expect(written).toContain("## Always use TypeScript strict mode");
      expect(written).toContain("**Count**: 5");
    });

    it("should use custom targets when specified", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const { hierarchy, claudeAdapter, agentsAdapter } = createHierarchy({ memories: [memory] });

      const result = await hierarchy.promoteToCore(memory.id, ["claude_md"]);

      expect(result.success).toBe(true);
      expect(claudeAdapter.appendCalls.length).toBe(1);
      expect(agentsAdapter.appendCalls.length).toBe(0);
    });
  });

  describe("Query Methods", () => {
    it("should return promotable-to-core memories", async () => {
      const eligible = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });
      const ineligible = makeMemory({
        observation: makeObservation({ count: 1 }),
        promotedAt: new Date(),
      });

      const { hierarchy } = createHierarchy({ memories: [eligible, ineligible] });
      const promotable = await hierarchy.getPromotableToCore();

      expect(promotable.length).toBe(1);
      expect(promotable[0]!.id).toBe(eligible.id);
    });

    it("should return all non-denied, non-core long-term memories", async () => {
      const active = makeMemory({ status: "approved" });
      const denied = makeMemory({ status: "denied" });
      const core = makeMemory({ status: "scheduled-for-core" });

      const { hierarchy } = createHierarchy({ memories: [active, denied, core] });
      const longTerm = await hierarchy.getLongTermMemories();

      expect(longTerm.length).toBe(1);
      expect(longTerm[0]!.id).toBe(active.id);
    });

    it("should return correct counts across all levels", async () => {
      const obs1 = makeObservation({ id: "obs-1", status: "pending" });
      const obs2 = makeObservation({ id: "obs-2", status: "pending" });
      const mem1 = makeMemory({ status: "approved" });
      const mem2 = makeMemory({ status: "scheduled-for-core" });

      const { hierarchy } = createHierarchy({
        observations: [obs1, obs2],
        memories: [mem1, mem2],
      });

      const counts = await hierarchy.getCounts();
      expect(counts.pending).toBe(2);
      expect(counts.longTerm).toBe(1);
      expect(counts.core).toBe(1);
    });

    it("should return null for non-existent memory ID", async () => {
      const { hierarchy } = createHierarchy();
      const memory = await hierarchy.getMemoryById("non-existent");
      expect(memory).toBeNull();
    });
  });

  describe("Deny Operations", () => {
    it("should deny an observation", async () => {
      const obs = makeObservation({ status: "pending" });
      const { hierarchy, obsStore } = createHierarchy({ observations: [obs] });

      await hierarchy.denyObservation(obs.id);

      const updated = await obsStore.getById(obs.id);
      expect(updated!.status).toBe("denied");
    });

    it("should deny a long-term memory", async () => {
      const memory = makeMemory({ status: "approved" });
      const { hierarchy, memStore } = createHierarchy({ memories: [memory] });

      await hierarchy.denyMemory(memory.id);

      const updated = await memStore.getById(memory.id);
      expect(updated!.status).toBe("denied");
    });

    it("should mark memory as rejected", async () => {
      const memory = makeMemory({ status: "approved" });
      const { hierarchy, memStore } = createHierarchy({ memories: [memory] });

      await hierarchy.markRejected(memory.id);

      const updated = await memStore.getById(memory.id);
      expect(updated!.status).toBe("denied");
    });
  });

  describe("Format For Core Memory", () => {
    it("should format memory as markdown with all fields", async () => {
      const obs = makeObservation({
        text: "Use composition over inheritance",
        count: 7,
        category: "pattern",
        sourceSessionIds: ["sess-1", "sess-2", "sess-3"],
      });
      const memory: LongTermMemory = {
        id: "mem-1",
        observation: obs,
        promotedAt: new Date(),
        status: "approved",
      };

      const { hierarchy } = createHierarchy();
      const formatted = hierarchy.formatForCoreMemory(memory);

      expect(formatted).toContain("## Use composition over inheritance");
      expect(formatted).toContain("**Count**: 7");
      expect(formatted).toContain("sess-1, sess-2, sess-3");
      expect(formatted).toContain("pattern");
    });

    it("should handle missing optional fields gracefully", async () => {
      const obs = makeObservation({
        text: "Simple pattern",
        count: 2,
        sourceSessionIds: [],
        category: undefined,
      });
      const memory: LongTermMemory = {
        id: "mem-2",
        observation: obs,
        promotedAt: new Date(),
        status: "approved",
      };

      const { hierarchy } = createHierarchy();
      const formatted = hierarchy.formatForCoreMemory(memory);

      expect(formatted).toContain("## Simple pattern");
      expect(formatted).toContain("**Count**: 2");
      // Should not contain Sessions or Category lines when empty
      expect(formatted).not.toContain("**Sessions**:");
      expect(formatted).not.toContain("**Category**:");
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero-count observation", async () => {
      const obs = makeObservation({ count: 0, status: "pending" });
      const { hierarchy } = createHierarchy({ observations: [obs] });

      const result = await hierarchy.promoteToLongTerm(obs.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("Count too low");
    });

    it("should handle promotion with exactly minimum thresholds", async () => {
      const thresholds: PromotionThresholds = {
        observationToLongTerm: { minCount: 2, requiresApproval: true },
        longTermToCore: { minCount: 3, minDaysInLongTerm: 7, requiresApproval: true },
      };
      const memory = makeMemory({
        observation: makeObservation({ count: 3 }),
        promotedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Exactly 7 days
      });
      const { hierarchy } = createHierarchy({ memories: [memory], thresholds });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(true);
    });

    it("should prevent promotion to core when no adapters configured", async () => {
      const memory = makeMemory({
        observation: makeObservation({ count: 5 }),
        promotedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });

      const obsStore = new MockObservationStore();
      const memStore = new MockMemoryStore();
      memStore._set(memory);

      const hierarchy = new MemoryHierarchy({
        observationStore: obsStore as any,
        memoryStore: memStore as any,
        coreMemoryAdapters: [], // No adapters
      });

      const result = await hierarchy.promoteToCore(memory.id);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("No core memory targets");
    });

    it("should use default thresholds when none provided", async () => {
      const { hierarchy } = createHierarchy();

      // Access internal thresholds indirectly by testing behavior
      const obs = makeObservation({ count: 1, status: "pending" }); // Below default minCount of 2
      const { obsStore } = createHierarchy({ observations: [obs] });
      const h2 = new MemoryHierarchy({
        observationStore: obsStore as any,
        memoryStore: new MockMemoryStore() as any,
        coreMemoryAdapters: [],
      });

      const result = await h2.promoteToLongTerm(obs.id);
      expect(result.success).toBe(false);
    });
  });
});
