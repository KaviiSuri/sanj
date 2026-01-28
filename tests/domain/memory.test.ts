/**
 * Tests for domain/memory.ts
 *
 * Validates the Memory hierarchy (SessionMemory, ProjectMemory, GlobalMemory),
 * the MemoryFactory, the queryMemories helper, and serialization round-trips.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  Memory,
  SessionMemory,
  ProjectMemory,
  GlobalMemory,
  MemoryFactory,
  queryMemories,
  serializeObservation,
  deserializeObservation,
} from "../../src/domain/memory.ts";
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
// Memory Base Class
// =============================================================================

describe("Memory base class", () => {
  test("constructor assigns id, observation, scope, timestamps", () => {
    const obs = makeObservation();
    const mem = new Memory(obs, "session");

    expect(typeof mem.id).toBe("string");
    expect(mem.observation).toBe(obs);
    expect(mem.scope).toBe("session");
    expect(mem.createdAt).toBeInstanceOf(Date);
    expect(mem.updatedAt).toBeInstanceOf(Date);
  });

  test("constructor accepts explicit id and createdAt", () => {
    const obs = makeObservation();
    const createdAt = daysAgo(5);
    const mem = new Memory(obs, "project", "my-custom-id", createdAt);

    expect(mem.id).toBe("my-custom-id");
    expect(mem.createdAt).toBe(createdAt);
  });

  test("constructor accepts childMemoryIds", () => {
    const obs = makeObservation();
    const children = ["child-1", "child-2"];
    const mem = new Memory(obs, "global", undefined, undefined, children);

    expect(mem.getChildMemoryIds()).toEqual(["child-1", "child-2"]);
  });

  test("getChildMemoryIds returns empty array when none set", () => {
    const mem = new Memory(makeObservation(), "session");
    expect(mem.getChildMemoryIds()).toEqual([]);
  });

  test("addChildMemoryId appends unique child ids", () => {
    const mem = new Memory(makeObservation(), "project");
    mem.addChildMemoryId("child-a");
    mem.addChildMemoryId("child-b");

    expect(mem.getChildMemoryIds()).toContain("child-a");
    expect(mem.getChildMemoryIds()).toContain("child-b");
    expect(mem.getChildMemoryIds()).toHaveLength(2);
  });

  test("addChildMemoryId ignores duplicates", () => {
    const mem = new Memory(makeObservation(), "project");
    mem.addChildMemoryId("child-a");
    mem.addChildMemoryId("child-a");

    expect(mem.getChildMemoryIds()).toHaveLength(1);
  });

  test("addChildMemoryId updates updatedAt", () => {
    const createdAt = daysAgo(1);
    const mem = new Memory(makeObservation(), "project", undefined, createdAt);
    const beforeUpdate = mem.updatedAt;

    // Small delay to ensure timestamp differs
    mem.addChildMemoryId("new-child");
    expect(mem.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
  });

  test("daysSinceCreation returns 0 for newly created memory", () => {
    const mem = new Memory(makeObservation(), "session");
    expect(mem.daysSinceCreation()).toBe(0);
  });

  test("daysSinceCreation returns correct days for old memory", () => {
    const mem = new Memory(makeObservation(), "session", undefined, daysAgo(10));
    expect(mem.daysSinceCreation()).toBe(10);
  });

  test("checkPromotionEligibility returns eligible when thresholds met", () => {
    const obs = makeObservation({ count: 5 });
    const mem = new Memory(obs, "session", undefined, daysAgo(10));
    const config = makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 });

    const result = mem.checkPromotionEligibility(config);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.currentCount).toBe(5);
    expect(result.requiredCount).toBe(3);
    expect(result.currentDays).toBe(10);
    expect(result.requiredDays).toBe(7);
  });

  test("checkPromotionEligibility returns ineligible when count too low", () => {
    const obs = makeObservation({ count: 1 });
    const mem = new Memory(obs, "session", undefined, daysAgo(10));
    const config = makeConfig({ observationCountThreshold: 5, longTermDaysThreshold: 7 });

    const result = mem.checkPromotionEligibility(config);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("count");
  });

  test("checkPromotionEligibility returns ineligible when days too low", () => {
    const obs = makeObservation({ count: 10 });
    const mem = new Memory(obs, "session", undefined, daysAgo(2));
    const config = makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 });

    const result = mem.checkPromotionEligibility(config);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("days");
  });

  test("checkPromotionEligibility lists both shortages when both fail", () => {
    const obs = makeObservation({ count: 1 });
    const mem = new Memory(obs, "session", undefined, daysAgo(2));
    const config = makeConfig({ observationCountThreshold: 5, longTermDaysThreshold: 7 });

    const result = mem.checkPromotionEligibility(config);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("count");
    expect(result.reason).toContain("days");
  });

  test("serialize returns all expected fields", () => {
    const obs = makeObservation();
    const mem = new Memory(obs, "session");
    const serialized = mem.serialize();

    expect(serialized.id).toBe(mem.id);
    expect(serialized.scope).toBe("session");
    expect(serialized.observation.text).toBe(obs.text);
    expect(typeof serialized.createdAt).toBe("string");
    expect(typeof serialized.updatedAt).toBe("string");
  });

  test("serialize omits childMemoryIds when empty", () => {
    const mem = new Memory(makeObservation(), "session");
    const serialized = mem.serialize();
    expect(serialized.childMemoryIds).toBeUndefined();
  });

  test("serialize includes childMemoryIds when non-empty", () => {
    const mem = new Memory(makeObservation(), "project", undefined, undefined, ["c1", "c2"]);
    const serialized = mem.serialize();
    expect(serialized.childMemoryIds).toEqual(["c1", "c2"]);
  });
});

// =============================================================================
// SessionMemory
// =============================================================================

describe("SessionMemory", () => {
  test("constructor sets scope to session and stores sessionId", () => {
    const obs = makeObservation();
    const mem = new SessionMemory(obs, "sess-abc-123");

    expect(mem.scope).toBe("session");
    expect(mem.sessionId).toBe("sess-abc-123");
    expect(mem.observation).toBe(obs);
  });

  test("serialize includes sessionId", () => {
    const mem = new SessionMemory(makeObservation(), "sess-xyz");
    const serialized = mem.serialize();

    expect(serialized.sessionId).toBe("sess-xyz");
    expect(serialized.scope).toBe("session");
  });

  test("accepts optional id and createdAt", () => {
    const obs = makeObservation();
    const createdAt = daysAgo(3);
    const mem = new SessionMemory(obs, "sess-1", "custom-id", createdAt);

    expect(mem.id).toBe("custom-id");
    expect(mem.createdAt).toBe(createdAt);
  });
});

// =============================================================================
// ProjectMemory
// =============================================================================

describe("ProjectMemory", () => {
  test("constructor sets scope to project and stores projectId", () => {
    const obs = makeObservation();
    const mem = new ProjectMemory(obs, "my-project");

    expect(mem.scope).toBe("project");
    expect(mem.projectId).toBe("my-project");
  });

  test("serialize includes projectId", () => {
    const mem = new ProjectMemory(makeObservation(), "proj-123");
    const serialized = mem.serialize();

    expect(serialized.projectId).toBe("proj-123");
    expect(serialized.scope).toBe("project");
  });

  test("fromSessionMemories merges counts", () => {
    const obs1 = makeObservation({ count: 3, sourceSessionIds: ["s1"] });
    const obs2 = makeObservation({ count: 4, sourceSessionIds: ["s2"] });
    const sm1 = new SessionMemory(obs1, "s1");
    const sm2 = new SessionMemory(obs2, "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.observation.count).toBe(7);
  });

  test("fromSessionMemories unions sourceSessionIds", () => {
    const obs1 = makeObservation({ sourceSessionIds: ["s1", "s3"] });
    const obs2 = makeObservation({ sourceSessionIds: ["s2", "s3"] });
    const sm1 = new SessionMemory(obs1, "s1");
    const sm2 = new SessionMemory(obs2, "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.observation.sourceSessionIds).toContain("s1");
    expect(pm.observation.sourceSessionIds).toContain("s2");
    expect(pm.observation.sourceSessionIds).toContain("s3");
    // s3 appears only once
    const s3Count = pm.observation.sourceSessionIds.filter((id) => id === "s3").length;
    expect(s3Count).toBe(1);
  });

  test("fromSessionMemories takes earliest firstSeen", () => {
    const early = daysAgo(10);
    const late = daysAgo(2);
    const obs1 = makeObservation({ firstSeen: late });
    const obs2 = makeObservation({ firstSeen: early });
    const sm1 = new SessionMemory(obs1, "s1");
    const sm2 = new SessionMemory(obs2, "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.observation.firstSeen).toEqual(early);
  });

  test("fromSessionMemories takes latest lastSeen", () => {
    const early = daysAgo(10);
    const late = daysAgo(1);
    const obs1 = makeObservation({ lastSeen: early });
    const obs2 = makeObservation({ lastSeen: late });
    const sm1 = new SessionMemory(obs1, "s1");
    const sm2 = new SessionMemory(obs2, "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.observation.lastSeen).toEqual(late);
  });

  test("fromSessionMemories unions tags", () => {
    const obs1 = makeObservation({ tags: ["typescript", "read"] });
    const obs2 = makeObservation({ tags: ["read", "bash"] });
    const sm1 = new SessionMemory(obs1, "s1");
    const sm2 = new SessionMemory(obs2, "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.observation.tags).toContain("typescript");
    expect(pm.observation.tags).toContain("read");
    expect(pm.observation.tags).toContain("bash");
  });

  test("fromSessionMemories tracks child memory ids", () => {
    const sm1 = new SessionMemory(makeObservation(), "s1");
    const sm2 = new SessionMemory(makeObservation(), "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.getChildMemoryIds()).toContain(sm1.id);
    expect(pm.getChildMemoryIds()).toContain(sm2.id);
  });

  test("fromSessionMemories throws on empty array", () => {
    expect(() => ProjectMemory.fromSessionMemories("proj-1", [])).toThrow();
  });

  test("fromSessionMemories sets status to pending", () => {
    const sm = new SessionMemory(makeObservation({ status: "approved" }), "s1");
    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm]);
    expect(pm.observation.status).toBe("pending");
  });

  test("fromSessionMemories uses text from first session memory", () => {
    const obs1 = makeObservation({ text: "first text here" });
    const obs2 = makeObservation({ text: "second text here" });
    const sm1 = new SessionMemory(obs1, "s1");
    const sm2 = new SessionMemory(obs2, "s2");

    const pm = ProjectMemory.fromSessionMemories("proj-1", [sm1, sm2]);
    expect(pm.observation.text).toBe("first text here");
  });
});

// =============================================================================
// GlobalMemory
// =============================================================================

describe("GlobalMemory", () => {
  test("constructor sets scope to global", () => {
    const obs = makeObservation();
    const mem = new GlobalMemory(obs);
    expect(mem.scope).toBe("global");
  });

  test("fromProjectMemories merges counts and unions sessions", () => {
    const obs1 = makeObservation({ count: 5, sourceSessionIds: ["s1", "s2"] });
    const obs2 = makeObservation({ count: 3, sourceSessionIds: ["s3"] });
    const pm1 = new ProjectMemory(obs1, "proj-1");
    const pm2 = new ProjectMemory(obs2, "proj-2");

    const gm = GlobalMemory.fromProjectMemories([pm1, pm2]);
    expect(gm.observation.count).toBe(8);
    expect(gm.observation.sourceSessionIds).toContain("s1");
    expect(gm.observation.sourceSessionIds).toContain("s2");
    expect(gm.observation.sourceSessionIds).toContain("s3");
  });

  test("fromProjectMemories tracks child project memory ids", () => {
    const pm1 = new ProjectMemory(makeObservation(), "proj-1");
    const pm2 = new ProjectMemory(makeObservation(), "proj-2");

    const gm = GlobalMemory.fromProjectMemories([pm1, pm2]);
    expect(gm.getChildMemoryIds()).toContain(pm1.id);
    expect(gm.getChildMemoryIds()).toContain(pm2.id);
  });

  test("fromProjectMemories throws on empty array", () => {
    expect(() => GlobalMemory.fromProjectMemories([])).toThrow();
  });

  test("checkPromotionEligibility requires 2+ source sessions", () => {
    const obs = makeObservation({ count: 10, sourceSessionIds: ["only-one"] });
    const gm = new GlobalMemory(obs, undefined, daysAgo(30));
    const config = makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 });

    const result = gm.checkPromotionEligibility(config);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("2 source sessions");
  });

  test("checkPromotionEligibility is eligible with 2+ source sessions and thresholds met", () => {
    const obs = makeObservation({ count: 10, sourceSessionIds: ["s1", "s2", "s3"] });
    const gm = new GlobalMemory(obs, undefined, daysAgo(30));
    const config = makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 });

    const result = gm.checkPromotionEligibility(config);
    expect(result.eligible).toBe(true);
  });

  test("toLongTermMemory produces valid LongTermMemory", () => {
    const obs = makeObservation();
    const gm = new GlobalMemory(obs);
    const ltm = gm.toLongTermMemory();

    expect(ltm.id).toBe(gm.id);
    expect(ltm.observation).toBe(obs);
    expect(ltm.status).toBe("approved");
    expect(ltm.promotedAt).toBeInstanceOf(Date);
  });

  test("toLongTermMemory accepts explicit promotedAt", () => {
    const gm = new GlobalMemory(makeObservation());
    const promotedAt = daysAgo(1);
    const ltm = gm.toLongTermMemory(promotedAt);

    expect(ltm.promotedAt).toBe(promotedAt);
  });

  test("serialize does not include projectId", () => {
    const gm = new GlobalMemory(makeObservation());
    const serialized = gm.serialize();
    expect(serialized.projectId).toBeUndefined();
  });
});

// =============================================================================
// MemoryFactory (domain)
// =============================================================================

describe("MemoryFactory (domain)", () => {
  test("createSessionMemory returns SessionMemory with correct sessionId", () => {
    const obs = makeObservation();
    const mem = MemoryFactory.createSessionMemory(obs, "sess-1");

    expect(mem).toBeInstanceOf(SessionMemory);
    expect(mem.sessionId).toBe("sess-1");
    expect(mem.scope).toBe("session");
  });

  test("createProjectMemory returns ProjectMemory with correct projectId", () => {
    const obs = makeObservation();
    const mem = MemoryFactory.createProjectMemory(obs, "proj-1", ["child-1"]);

    expect(mem).toBeInstanceOf(ProjectMemory);
    expect(mem.projectId).toBe("proj-1");
    expect(mem.getChildMemoryIds()).toContain("child-1");
  });

  test("createGlobalMemory returns GlobalMemory", () => {
    const obs = makeObservation();
    const mem = MemoryFactory.createGlobalMemory(obs, ["child-a", "child-b"]);

    expect(mem).toBeInstanceOf(GlobalMemory);
    expect(mem.scope).toBe("global");
    expect(mem.getChildMemoryIds()).toContain("child-a");
  });

  test("fromSerialized round-trips SessionMemory", () => {
    const obs = makeObservation({ tags: ["tag1"], metadata: { key: "val" } });
    const original = new SessionMemory(obs, "sess-round-trip");
    const serialized = original.serialize();

    const restored = MemoryFactory.fromSerialized(serialized);
    expect(restored).toBeInstanceOf(SessionMemory);
    expect((restored as SessionMemory).sessionId).toBe("sess-round-trip");
    expect(restored.id).toBe(original.id);
    expect(restored.scope).toBe("session");
    expect(restored.observation.text).toBe(obs.text);
    expect(restored.observation.count).toBe(obs.count);
    expect(restored.observation.tags).toEqual(["tag1"]);
    expect(restored.observation.metadata).toEqual({ key: "val" });
  });

  test("fromSerialized round-trips ProjectMemory", () => {
    const obs = makeObservation();
    const original = new ProjectMemory(obs, "proj-rt", undefined, undefined, ["child-1"]);
    const serialized = original.serialize();

    const restored = MemoryFactory.fromSerialized(serialized);
    expect(restored).toBeInstanceOf(ProjectMemory);
    expect((restored as ProjectMemory).projectId).toBe("proj-rt");
    expect(restored.getChildMemoryIds()).toContain("child-1");
  });

  test("fromSerialized round-trips GlobalMemory", () => {
    const obs = makeObservation();
    const original = new GlobalMemory(obs, undefined, undefined, ["c1", "c2"]);
    const serialized = original.serialize();

    const restored = MemoryFactory.fromSerialized(serialized);
    expect(restored).toBeInstanceOf(GlobalMemory);
    expect(restored.getChildMemoryIds()).toContain("c1");
    expect(restored.getChildMemoryIds()).toContain("c2");
  });

  test("fromSerialized throws for SessionMemory without sessionId", () => {
    const serialized = {
      id: "test",
      scope: "session" as const,
      observation: serializeObservation(makeObservation()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // sessionId intentionally omitted
    };

    expect(() => MemoryFactory.fromSerialized(serialized)).toThrow("sessionId");
  });

  test("fromSerialized throws for ProjectMemory without projectId", () => {
    const serialized = {
      id: "test",
      scope: "project" as const,
      observation: serializeObservation(makeObservation()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // projectId intentionally omitted
    };

    expect(() => MemoryFactory.fromSerialized(serialized)).toThrow("projectId");
  });

  test("fromSerialized throws for unknown scope", () => {
    const serialized = {
      id: "test",
      scope: "unknown" as any,
      observation: serializeObservation(makeObservation()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => MemoryFactory.fromSerialized(serialized)).toThrow();
  });
});

// =============================================================================
// queryMemories helper
// =============================================================================

describe("queryMemories", () => {
  let memories: Memory[];

  beforeEach(() => {
    memories = [
      new SessionMemory(
        makeObservation({ count: 5, category: "pattern", tags: ["read", "tool"] }),
        "s1"
      ),
      new ProjectMemory(
        makeObservation({ count: 2, category: "workflow", tags: ["bash"] }),
        "proj-1"
      ),
      new GlobalMemory(
        makeObservation({ count: 10, category: "preference", tags: ["style", "tool"] })
      ),
    ];
  });

  test("returns all memories when no filter applied", () => {
    const result = queryMemories(memories, {});
    expect(result).toHaveLength(3);
  });

  test("filters by scope", () => {
    const result = queryMemories(memories, { scope: "session" });
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("session");
  });

  test("filters by minCount", () => {
    const result = queryMemories(memories, { minCount: 5 });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.observation.count >= 5)).toBe(true);
  });

  test("filters by category", () => {
    const result = queryMemories(memories, { category: "workflow" });
    expect(result).toHaveLength(1);
    expect(result[0].observation.category).toBe("workflow");
  });

  test("filters by tags using OR logic", () => {
    const result = queryMemories(memories, { tags: ["tool"] });
    expect(result).toHaveLength(2);
  });

  test("filters by eligibleForPromotion", () => {
    // The GlobalMemory has count=10, created just now (0 days)
    // With threshold of 7 days, it should NOT be eligible
    const config = makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 });
    const result = queryMemories(memories, { eligibleForPromotion: true, config });
    expect(result).toHaveLength(0); // All created just now, so days=0 < 7
  });

  test("eligibleForPromotion includes old enough memories", () => {
    const oldMemory = new Memory(
      makeObservation({ count: 10 }),
      "session",
      undefined,
      daysAgo(30)
    );
    const config = makeConfig({ observationCountThreshold: 3, longTermDaysThreshold: 7 });
    const result = queryMemories([oldMemory], { eligibleForPromotion: true, config });
    expect(result).toHaveLength(1);
  });

  test("combines multiple filters with AND logic", () => {
    const result = queryMemories(memories, {
      scope: "session",
      category: "pattern",
      minCount: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("session");
    expect(result[0].observation.category).toBe("pattern");
  });

  test("returns empty array when no memory matches", () => {
    const result = queryMemories(memories, { scope: "global", category: "workflow" });
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// Serialization helpers
// =============================================================================

describe("serializeObservation / deserializeObservation", () => {
  test("round-trip preserves all fields including Dates", () => {
    const now = new Date();
    const obs: Observation = {
      id: "obs-123",
      text: "Use read tool for file access",
      category: "tool-choice",
      count: 7,
      status: "approved",
      sourceSessionIds: ["s1", "s2", "s3"],
      firstSeen: daysAgo(15),
      lastSeen: now,
      tags: ["tool", "read", "file"],
      metadata: { toolName: "read", frequency: 7 },
    };

    const serialized = serializeObservation(obs);
    const restored = deserializeObservation(serialized);

    expect(restored.id).toBe("obs-123");
    expect(restored.text).toBe("Use read tool for file access");
    expect(restored.category).toBe("tool-choice");
    expect(restored.count).toBe(7);
    expect(restored.status).toBe("approved");
    expect(restored.sourceSessionIds).toEqual(["s1", "s2", "s3"]);
    expect(restored.firstSeen).toBeInstanceOf(Date);
    expect(restored.lastSeen).toBeInstanceOf(Date);
    expect(restored.firstSeen.getTime()).toBe(obs.firstSeen.getTime());
    expect(restored.lastSeen.getTime()).toBe(obs.lastSeen.getTime());
    expect(restored.tags).toEqual(["tool", "read", "file"]);
    expect(restored.metadata).toEqual({ toolName: "read", frequency: 7 });
  });

  test("round-trip preserves undefined optional fields", () => {
    const obs = makeObservation({ tags: undefined, metadata: undefined });
    const serialized = serializeObservation(obs);
    const restored = deserializeObservation(serialized);

    expect(restored.tags).toBeUndefined();
    expect(restored.metadata).toBeUndefined();
  });

  test("serializeObservation converts Dates to ISO strings", () => {
    const obs = makeObservation();
    const serialized = serializeObservation(obs);

    expect(typeof serialized.firstSeen).toBe("string");
    expect(typeof serialized.lastSeen).toBe("string");
    // Should be valid ISO string
    expect(new Date(serialized.firstSeen).getTime()).not.toBeNaN();
    expect(new Date(serialized.lastSeen).getTime()).not.toBeNaN();
  });

  test("deserializeObservation creates Date objects from strings", () => {
    const serialized = {
      id: "test",
      text: "test observation",
      count: 1,
      status: "pending" as const,
      sourceSessionIds: ["s1"],
      firstSeen: "2024-01-15T10:30:00.000Z",
      lastSeen: "2024-06-20T14:45:00.000Z",
    };

    const restored = deserializeObservation(serialized);
    expect(restored.firstSeen).toBeInstanceOf(Date);
    expect(restored.lastSeen).toBeInstanceOf(Date);
    expect(restored.firstSeen.toISOString()).toBe("2024-01-15T10:30:00.000Z");
    expect(restored.lastSeen.toISOString()).toBe("2024-06-20T14:45:00.000Z");
  });

  test("serializeObservation copies arrays to prevent mutation", () => {
    const tags = ["a", "b"];
    const sessionIds = ["s1"];
    const obs = makeObservation({ tags, sourceSessionIds: sessionIds });

    const serialized = serializeObservation(obs);
    serialized.tags?.push("c");
    serialized.sourceSessionIds.push("s2");

    expect(obs.tags).toHaveLength(2);
    expect(obs.sourceSessionIds).toHaveLength(1);
  });
});
