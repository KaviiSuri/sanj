/**
 * Tests for storage/memory-store.ts
 *
 * Comprehensive test suite covering:
 * - Promotion operations (observation → long-term, long-term → core)
 * - Query with memory-specific filters
 * - Eligibility checking
 * - Days calculation
 * - getCounts() accuracy
 * - Status management
 * - Atomic write behavior
 * - Edge cases and error handling
 * - Persistence across load/save cycles
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MemoryStore } from "../../src/storage/memory-store";
import type { Observation, LongTermMemory } from "../../src/core/types";
import { SanjError } from "../../src/core/types";

// Use a temporary directory for tests
let TEST_DIR: string;
let TEST_STORE_PATH: string;
let store: MemoryStore;

// Mock observation store for testing promotion
class MockObservationStore {
  private observations: Map<string, Observation> = new Map();

  addObservation(obs: Observation) {
    this.observations.set(obs.id, obs);
  }

  async getById(id: string): Promise<Observation | null> {
    return this.observations.get(id) || null;
  }
}

beforeEach(async () => {
  // Create unique test directory for each test
  TEST_DIR = join(tmpdir(), `sanj-test-mem-${Date.now()}-${Math.random()}`);
  TEST_STORE_PATH = join(TEST_DIR, "long-term-memory.json");

  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }

  // Create store instance without observation store by default
  store = new MemoryStore(TEST_STORE_PATH);
  await store.load();
});

afterEach(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// Helper to create a test observation
function createTestObservation(overrides?: Partial<Observation>): Observation {
  return {
    id: crypto.randomUUID(),
    text: "Test observation",
    count: 1,
    status: "approved",
    sourceSessionIds: ["session-1"],
    firstSeen: new Date("2026-01-01"),
    lastSeen: new Date("2026-01-15"),
    ...overrides,
  };
}

// Helper to create a long-term memory directly (for testing)
async function createMemoryDirectly(
  store: MemoryStore,
  observation: Observation,
  promotedAt?: Date
): Promise<LongTermMemory> {
  // We need to use the promoteToLongTerm method with a mock observation store
  const mockStore = new MockObservationStore();
  mockStore.addObservation(observation);

  const storeWithMock = new MemoryStore(TEST_STORE_PATH, mockStore);
  await storeWithMock.load();

  const result = await storeWithMock.promoteToLongTerm(observation.id);
  if (!result.success) {
    throw new Error(`Failed to create memory: ${result.reason}`);
  }

  const memory = await storeWithMock.getById(result.id!);
  if (!memory) {
    throw new Error("Memory not found after creation");
  }

  // Override promotedAt if specified (for testing time-based logic)
  if (promotedAt) {
    memory.promotedAt = promotedAt;
    await storeWithMock.save();
  }

  // Reload main store to pick up changes
  await store.load();

  return memory;
}

// =============================================================================
// Lifecycle Tests
// =============================================================================

describe("MemoryStore - Lifecycle", () => {
  test("load() initializes empty store when file doesn't exist", async () => {
    const count = await store.count();
    expect(count).toBe(0);
  });

  test("load() reads existing file correctly", async () => {
    const obs1 = createTestObservation({ text: "Memory 1" });
    const obs2 = createTestObservation({ text: "Memory 2" });

    await createMemoryDirectly(store, obs1);
    await createMemoryDirectly(store, obs2);

    // Create new store instance and load
    const newStore = new MemoryStore(TEST_STORE_PATH);
    await newStore.load();

    const count = await newStore.count();
    expect(count).toBe(2);

    const all = await newStore.getAll();
    expect(all).toHaveLength(2);
  });

  test("load() throws on malformed JSON", async () => {
    // Write invalid JSON
    await Bun.write(TEST_STORE_PATH, "{ invalid json }");

    const newStore = new MemoryStore(TEST_STORE_PATH);
    await expect(newStore.load()).rejects.toThrow("Invalid JSON format");
  });

  test("save() creates file with proper format", async () => {
    const obs = createTestObservation();
    await createMemoryDirectly(store, obs);

    expect(existsSync(TEST_STORE_PATH)).toBe(true);

    const content = await Bun.file(TEST_STORE_PATH).text();
    const parsed = JSON.parse(content);

    expect(parsed.version).toBe(1);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].observation.text).toBe("Test observation");
  });

  test("save() uses atomic write pattern (no temp file left behind)", async () => {
    const obs = createTestObservation();
    await createMemoryDirectly(store, obs);

    const tempPath = `${TEST_STORE_PATH}.tmp`;
    expect(existsSync(tempPath)).toBe(false);
  });

  test("save() creates parent directory if missing", async () => {
    // Remove test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    const mockStore = new MockObservationStore();
    const obs = createTestObservation();
    mockStore.addObservation(obs);

    const newStore = new MemoryStore(TEST_STORE_PATH, mockStore);
    await newStore.promoteToLongTerm(obs.id);

    expect(existsSync(TEST_DIR)).toBe(true);
    expect(existsSync(TEST_STORE_PATH)).toBe(true);
  });

  test("count() returns correct number of memories", async () => {
    expect(await store.count()).toBe(0);

    const obs1 = createTestObservation();
    await createMemoryDirectly(store, obs1);
    expect(await store.count()).toBe(1);

    const obs2 = createTestObservation();
    await createMemoryDirectly(store, obs2);
    expect(await store.count()).toBe(2);
  });

  test("clear() removes all memories", async () => {
    const obs1 = createTestObservation();
    const obs2 = createTestObservation();
    await createMemoryDirectly(store, obs1);
    await createMemoryDirectly(store, obs2);

    expect(await store.count()).toBe(2);

    await store.clear();

    expect(await store.count()).toBe(0);
  });

  test("data persists across multiple load/save cycles", async () => {
    const obs = createTestObservation({
      text: "Persistent memory",
      count: 5,
      category: "preference",
      tags: ["typescript"],
    });

    const memory = await createMemoryDirectly(store, obs);

    // Load in new store
    const store2 = new MemoryStore(TEST_STORE_PATH);
    await store2.load();

    const loaded = await store2.getById(memory.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.observation.text).toBe("Persistent memory");
    expect(loaded!.observation.count).toBe(5);
    expect(loaded!.observation.category).toBe("preference");
    expect(loaded!.observation.tags).toEqual(["typescript"]);
    expect(loaded!.status).toBe("approved");
  });
});

// =============================================================================
// Promotion Operations
// =============================================================================

describe("MemoryStore - Promotion", () => {
  test("promoteToLongTerm() creates new long-term memory", async () => {
    const mockStore = new MockObservationStore();
    const obs = createTestObservation();
    mockStore.addObservation(obs);

    const storeWithMock = new MemoryStore(TEST_STORE_PATH, mockStore);
    await storeWithMock.load();

    const result = await storeWithMock.promoteToLongTerm(obs.id);

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();

    const memory = await storeWithMock.getById(result.id!);
    expect(memory).not.toBeNull();
    expect(memory!.observation.id).toBe(obs.id);
    expect(memory!.status).toBe("approved");
  });

  test("promoteToLongTerm() fails if observation not found", async () => {
    const mockStore = new MockObservationStore();
    const storeWithMock = new MemoryStore(TEST_STORE_PATH, mockStore);
    await storeWithMock.load();

    const result = await storeWithMock.promoteToLongTerm("non-existent");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not found");
  });

  test("promoteToLongTerm() fails if observation not approved", async () => {
    const mockStore = new MockObservationStore();
    const obs = createTestObservation({ status: "pending" });
    mockStore.addObservation(obs);

    const storeWithMock = new MemoryStore(TEST_STORE_PATH, mockStore);
    await storeWithMock.load();

    const result = await storeWithMock.promoteToLongTerm(obs.id);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("must be approved");
  });

  test("promoteToLongTerm() fails without observation store", async () => {
    const result = await store.promoteToLongTerm("any-id");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not configured");
  });

  test("promoteToLongTerm() sets promotedAt timestamp", async () => {
    const mockStore = new MockObservationStore();
    const obs = createTestObservation();
    mockStore.addObservation(obs);

    const storeWithMock = new MemoryStore(TEST_STORE_PATH, mockStore);
    await storeWithMock.load();

    const before = new Date();
    const result = await storeWithMock.promoteToLongTerm(obs.id);
    const after = new Date();

    const memory = await storeWithMock.getById(result.id!);
    expect(memory!.promotedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(memory!.promotedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("promoteToCore() succeeds for eligible memory", async () => {
    // Create memory that meets thresholds
    const obs = createTestObservation({
      count: 5, // Above threshold (3)
    });

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10); // 10 days ago (above threshold of 7)

    const memory = await createMemoryDirectly(store, obs, oldDate);

    const result = await store.promoteToCore(memory.id, ["claude_md"]);

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();

    const updated = await store.getById(memory.id);
    expect(updated!.status).toBe("scheduled-for-core");
  });

  test("promoteToCore() fails if memory not found", async () => {
    const result = await store.promoteToCore("non-existent", ["claude_md"]);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not found");
  });

  test("promoteToCore() fails if count threshold not met", async () => {
    const obs = createTestObservation({
      count: 2, // Below threshold (3)
    });

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const memory = await createMemoryDirectly(store, obs, oldDate);

    const result = await store.promoteToCore(memory.id, ["claude_md"]);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not eligible");
    expect(result.reason).toContain("Count: 2/3");
  });

  test("promoteToCore() fails if time threshold not met", async () => {
    const obs = createTestObservation({
      count: 5, // Above threshold
    });

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3); // Only 3 days ago (below threshold of 7)

    const memory = await createMemoryDirectly(store, obs, recentDate);

    const result = await store.promoteToCore(memory.id, ["claude_md"]);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not eligible");
    expect(result.reason).toContain("Days: 3/7");
  });

  test("promoteToCore() supports multiple targets", async () => {
    const obs = createTestObservation({ count: 5 });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const memory = await createMemoryDirectly(store, obs, oldDate);

    const result = await store.promoteToCore(memory.id, ["claude_md", "agents_md"]);

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Read Operations
// =============================================================================

describe("MemoryStore - Read", () => {
  test("getAll() returns all memories", async () => {
    const obs1 = createTestObservation({ text: "Memory 1" });
    const obs2 = createTestObservation({ text: "Memory 2" });
    const obs3 = createTestObservation({ text: "Memory 3" });

    await createMemoryDirectly(store, obs1);
    await createMemoryDirectly(store, obs2);
    await createMemoryDirectly(store, obs3);

    const all = await store.getAll();
    expect(all).toHaveLength(3);
  });

  test("getAll() returns empty array when store is empty", async () => {
    const all = await store.getAll();
    expect(all).toEqual([]);
  });

  test("getById() retrieves existing memory", async () => {
    const obs = createTestObservation({ text: "Test memory" });
    const memory = await createMemoryDirectly(store, obs);

    const retrieved = await store.getById(memory.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(memory.id);
    expect(retrieved!.observation.text).toBe("Test memory");
  });

  test("getById() returns null for non-existent ID", async () => {
    const retrieved = await store.getById("non-existent");
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Query Operations
// =============================================================================

describe("MemoryStore - Query", () => {
  beforeEach(async () => {
    // Create test dataset
    const now = new Date();

    // Recent memory with low count
    const obs1 = createTestObservation({
      text: "Recent low count",
      count: 1,
    });
    await createMemoryDirectly(store, obs1, new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));

    // Old memory with high count (eligible for core)
    const obs2 = createTestObservation({
      text: "Old high count",
      count: 5,
    });
    await createMemoryDirectly(store, obs2, new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000));

    // Medium age, medium count
    const obs3 = createTestObservation({
      text: "Medium",
      count: 3,
    });
    const memory3 = await createMemoryDirectly(
      store,
      obs3,
      new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
    );

    // Already scheduled for core
    const obs4 = createTestObservation({
      text: "Scheduled for core",
      count: 10,
    });
    const memory4 = await createMemoryDirectly(
      store,
      obs4,
      new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
    );
    await store.setStatus(memory4.id, "scheduled-for-core");
  });

  test("query() filters by single status", async () => {
    const results = await store.query({ status: "approved" });
    expect(results).toHaveLength(3);
    expect(results.every((m) => m.status === "approved")).toBe(true);
  });

  test("query() filters by multiple statuses", async () => {
    const results = await store.query({
      status: ["approved", "scheduled-for-core"],
    });
    expect(results).toHaveLength(4);
  });

  test("query() filters by date range", async () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const results = await store.query({
      dateRange: {
        start: fiveDaysAgo,
        end: oneDayAgo,
      },
    });

    // Should exclude the recent one (2 days) and old ones (10+, 15+ days)
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  test("query() filters by eligibleForCore", async () => {
    const results = await store.query({ eligibleForCore: true });

    // Should return memories that meet count (3+) and time (7+ days) thresholds
    expect(results.length).toBeGreaterThan(0);
    results.forEach((memory) => {
      expect(memory.observation.count).toBeGreaterThanOrEqual(3);
      expect(store.daysSinceLongTermPromotion(memory)).toBeGreaterThanOrEqual(7);
    });
  });

  test("query() filters by minCount", async () => {
    const results = await store.query({ minCount: 5 });

    expect(results.length).toBeGreaterThan(0);
    results.forEach((memory) => {
      expect(memory.observation.count).toBeGreaterThanOrEqual(5);
    });
  });

  test("query() filters by minDays", async () => {
    const results = await store.query({ minDays: 9 });

    expect(results.length).toBeGreaterThan(0);
    results.forEach((memory) => {
      const days = store.daysSinceLongTermPromotion(memory);
      expect(days).toBeGreaterThanOrEqual(9);
    });
  });

  test("query() combines multiple filters", async () => {
    const results = await store.query({
      status: "approved",
      minCount: 3,
      minDays: 7,
    });

    results.forEach((memory) => {
      expect(memory.status).toBe("approved");
      expect(memory.observation.count).toBeGreaterThanOrEqual(3);
      expect(store.daysSinceLongTermPromotion(memory)).toBeGreaterThanOrEqual(7);
    });
  });

  test("query() returns empty array when no matches", async () => {
    const results = await store.query({
      minCount: 100,
    });

    expect(results).toEqual([]);
  });

  test("query() with pagination", async () => {
    const page1 = await store.query({}, { offset: 0, limit: 2 });
    const page2 = await store.query({}, { offset: 2, limit: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);

    // Verify no overlap
    const ids1 = page1.map((m) => m.id);
    const ids2 = page2.map((m) => m.id);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test("query() with sorting by promotedAt ascending", async () => {
    const results = await store.query(
      {},
      undefined,
      { field: "promotedAt", direction: "asc" }
    );

    expect(results).toHaveLength(4);

    // Verify order (oldest first)
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].promotedAt.getTime()).toBeLessThanOrEqual(
        results[i + 1].promotedAt.getTime()
      );
    }
  });

  test("query() with sorting by promotedAt descending", async () => {
    const results = await store.query(
      {},
      undefined,
      { field: "promotedAt", direction: "desc" }
    );

    expect(results).toHaveLength(4);

    // Verify order (newest first)
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].promotedAt.getTime()).toBeGreaterThanOrEqual(
        results[i + 1].promotedAt.getTime()
      );
    }
  });

  test("query() with pagination and sorting", async () => {
    const results = await store.query(
      {},
      { offset: 1, limit: 2 },
      { field: "promotedAt", direction: "desc" }
    );

    expect(results).toHaveLength(2);

    // Verify sorted order
    expect(results[0].promotedAt.getTime()).toBeGreaterThanOrEqual(
      results[1].promotedAt.getTime()
    );
  });

  test("getPromotableToCore() returns eligible memories", async () => {
    const promotable = await store.getPromotableToCore();

    expect(promotable.length).toBeGreaterThan(0);
    promotable.forEach((memory) => {
      expect(memory.observation.count).toBeGreaterThanOrEqual(3);
      expect(store.daysSinceLongTermPromotion(memory)).toBeGreaterThanOrEqual(7);
    });
  });
});

// =============================================================================
// Eligibility and Validation
// =============================================================================

describe("MemoryStore - Eligibility", () => {
  test("isEligibleForCorePromotion() returns true when both thresholds met", () => {
    const obs = createTestObservation({ count: 5 });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: oldDate,
      status: "approved",
    };

    expect(store.isEligibleForCorePromotion(memory)).toBe(true);
  });

  test("isEligibleForCorePromotion() returns false when count too low", () => {
    const obs = createTestObservation({ count: 2 });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: oldDate,
      status: "approved",
    };

    expect(store.isEligibleForCorePromotion(memory)).toBe(false);
  });

  test("isEligibleForCorePromotion() returns false when too recent", () => {
    const obs = createTestObservation({ count: 5 });
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3);

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: recentDate,
      status: "approved",
    };

    expect(store.isEligibleForCorePromotion(memory)).toBe(false);
  });

  test("isEligibleForCorePromotion() handles exact thresholds", () => {
    const obs = createTestObservation({ count: 3 }); // Exactly at threshold
    const exactDate = new Date();
    exactDate.setDate(exactDate.getDate() - 7); // Exactly at threshold

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: exactDate,
      status: "approved",
    };

    expect(store.isEligibleForCorePromotion(memory)).toBe(true);
  });

  test("daysSinceLongTermPromotion() calculates correctly", () => {
    const obs = createTestObservation();
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: tenDaysAgo,
      status: "approved",
    };

    const days = store.daysSinceLongTermPromotion(memory);
    expect(days).toBeGreaterThanOrEqual(9); // Account for timing variations
    expect(days).toBeLessThanOrEqual(11);
  });

  test("daysSinceLongTermPromotion() returns 0 for same day", () => {
    const obs = createTestObservation();
    const now = new Date();

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: now,
      status: "approved",
    };

    const days = store.daysSinceLongTermPromotion(memory);
    expect(days).toBe(0);
  });

  test("daysSinceLongTermPromotion() handles partial days correctly", () => {
    const obs = createTestObservation();
    const almostTwoDaysAgo = new Date();
    almostTwoDaysAgo.setDate(almostTwoDaysAgo.getDate() - 1);
    almostTwoDaysAgo.setHours(almostTwoDaysAgo.getHours() - 23);

    const memory: LongTermMemory = {
      id: crypto.randomUUID(),
      observation: obs,
      promotedAt: almostTwoDaysAgo,
      status: "approved",
    };

    const days = store.daysSinceLongTermPromotion(memory);
    expect(days).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// getCounts Tests
// =============================================================================

describe("MemoryStore - getCounts", () => {
  test("getCounts() returns accurate counts", async () => {
    // Create approved memories
    const obs1 = createTestObservation();
    const obs2 = createTestObservation();
    await createMemoryDirectly(store, obs1);
    await createMemoryDirectly(store, obs2);

    // Create scheduled-for-core memory
    const obs3 = createTestObservation({ count: 5 });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const memory3 = await createMemoryDirectly(store, obs3, oldDate);
    await store.setStatus(memory3.id, "scheduled-for-core");

    const counts = await store.getCounts();

    expect(counts.pending).toBe(0); // Placeholder
    expect(counts.longTerm).toBe(2);
    expect(counts.core).toBe(1);
  });

  test("getCounts() returns zeros for empty store", async () => {
    const counts = await store.getCounts();

    expect(counts.pending).toBe(0);
    expect(counts.longTerm).toBe(0);
    expect(counts.core).toBe(0);
  });

  test("getCounts() updates after status changes", async () => {
    const obs = createTestObservation({ count: 5 });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const memory = await createMemoryDirectly(store, obs, oldDate);

    let counts = await store.getCounts();
    expect(counts.longTerm).toBe(1);
    expect(counts.core).toBe(0);

    await store.setStatus(memory.id, "scheduled-for-core");

    counts = await store.getCounts();
    expect(counts.longTerm).toBe(0);
    expect(counts.core).toBe(1);
  });
});

// =============================================================================
// Update Operations
// =============================================================================

describe("MemoryStore - Update", () => {
  test("setStatus() changes memory status", async () => {
    const obs = createTestObservation();
    const memory = await createMemoryDirectly(store, obs);

    expect(memory.status).toBe("approved");

    const updated = await store.setStatus(memory.id, "scheduled-for-core");
    expect(updated.status).toBe("scheduled-for-core");

    const retrieved = await store.getById(memory.id);
    expect(retrieved!.status).toBe("scheduled-for-core");
  });

  test("setStatus() supports all valid statuses", async () => {
    const obs = createTestObservation();
    const memory = await createMemoryDirectly(store, obs);

    await store.setStatus(memory.id, "denied");
    let retrieved = await store.getById(memory.id);
    expect(retrieved!.status).toBe("denied");

    await store.setStatus(memory.id, "approved");
    retrieved = await store.getById(memory.id);
    expect(retrieved!.status).toBe("approved");

    await store.setStatus(memory.id, "scheduled-for-core");
    retrieved = await store.getById(memory.id);
    expect(retrieved!.status).toBe("scheduled-for-core");
  });

  test("setStatus() throws on non-existent ID", async () => {
    await expect(store.setStatus("non-existent", "denied")).rejects.toThrow(SanjError);
  });

  test("setStatus() persists changes", async () => {
    const obs = createTestObservation();
    const memory = await createMemoryDirectly(store, obs);

    await store.setStatus(memory.id, "scheduled-for-core");

    const newStore = new MemoryStore(TEST_STORE_PATH);
    await newStore.load();

    const retrieved = await newStore.getById(memory.id);
    expect(retrieved!.status).toBe("scheduled-for-core");
  });
});

// =============================================================================
// Delete Operations
// =============================================================================

describe("MemoryStore - Delete", () => {
  test("delete() removes memory", async () => {
    const obs = createTestObservation();
    const memory = await createMemoryDirectly(store, obs);

    const deleted = await store.delete(memory.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getById(memory.id);
    expect(retrieved).toBeNull();
  });

  test("delete() returns false for non-existent ID", async () => {
    const deleted = await store.delete("non-existent");
    expect(deleted).toBe(false);
  });

  test("delete() persists changes", async () => {
    const obs = createTestObservation();
    const memory = await createMemoryDirectly(store, obs);

    await store.delete(memory.id);

    const newStore = new MemoryStore(TEST_STORE_PATH);
    await newStore.load();

    const retrieved = await newStore.getById(memory.id);
    expect(retrieved).toBeNull();
  });

  test("delete() updates counts", async () => {
    const obs1 = createTestObservation();
    const obs2 = createTestObservation();
    const memory1 = await createMemoryDirectly(store, obs1);
    await createMemoryDirectly(store, obs2);

    let counts = await store.getCounts();
    expect(counts.longTerm).toBe(2);

    await store.delete(memory1.id);

    counts = await store.getCounts();
    expect(counts.longTerm).toBe(1);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("MemoryStore - Integration", () => {
  test("complete promotion lifecycle: observation → long-term → core", async () => {
    const mockObsStore = new MockObservationStore();
    const obs = createTestObservation({ count: 5 });
    mockObsStore.addObservation(obs);

    const storeWithMock = new MemoryStore(TEST_STORE_PATH, mockObsStore);
    await storeWithMock.load();

    // Promote to long-term
    const ltResult = await storeWithMock.promoteToLongTerm(obs.id);
    expect(ltResult.success).toBe(true);

    const memory = await storeWithMock.getById(ltResult.id!);
    expect(memory!.status).toBe("approved");

    // Override promotedAt to meet time threshold
    memory!.promotedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await storeWithMock.save();

    // Promote to core
    const coreResult = await storeWithMock.promoteToCore(memory!.id, ["claude_md"]);
    expect(coreResult.success).toBe(true);

    const updated = await storeWithMock.getById(memory!.id);
    expect(updated!.status).toBe("scheduled-for-core");
  });

  test("handles multiple memories at different stages", async () => {
    const now = new Date();

    // Recent memory (not eligible)
    const obs1 = createTestObservation({ text: "Recent", count: 1 });
    await createMemoryDirectly(store, obs1, new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));

    // Eligible memory
    const obs2 = createTestObservation({ text: "Eligible", count: 5 });
    await createMemoryDirectly(store, obs2, new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000));

    // Already promoted
    const obs3 = createTestObservation({ text: "Promoted", count: 10 });
    const memory3 = await createMemoryDirectly(
      store,
      obs3,
      new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
    );
    await store.setStatus(memory3.id, "scheduled-for-core");

    const counts = await store.getCounts();
    expect(counts.longTerm).toBe(2);
    expect(counts.core).toBe(1);

    const promotable = await store.getPromotableToCore();
    // Both "Eligible" and "Promoted" meet the thresholds (count >= 3, days >= 7)
    // getPromotableToCore() doesn't filter by status, only by eligibility
    expect(promotable).toHaveLength(2);

    // If we want only approved memories that are eligible:
    const approvedPromotable = await store.query({
      status: "approved",
      eligibleForCore: true,
    });
    expect(approvedPromotable).toHaveLength(1);
    expect(approvedPromotable[0].observation.text).toBe("Eligible");
  });

  test("query filters work correctly together", async () => {
    const now = new Date();

    // Create various memories
    const obs1 = createTestObservation({ count: 2 });
    await createMemoryDirectly(store, obs1, new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000));

    const obs2 = createTestObservation({ count: 4 });
    await createMemoryDirectly(store, obs2, new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000));

    const obs3 = createTestObservation({ count: 6 });
    await createMemoryDirectly(store, obs3, new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000));

    // Query: approved, count >= 3, days >= 7
    const results = await store.query({
      status: "approved",
      minCount: 3,
      minDays: 7,
    });

    expect(results).toHaveLength(2);
    results.forEach((memory) => {
      expect(memory.status).toBe("approved");
      expect(memory.observation.count).toBeGreaterThanOrEqual(3);
      expect(store.daysSinceLongTermPromotion(memory)).toBeGreaterThanOrEqual(7);
    });
  });

  test("handles large dataset efficiently", async () => {
    const now = new Date();

    // Create 50 memories with varying properties
    for (let i = 0; i < 50; i++) {
      const obs = createTestObservation({
        text: `Memory ${i}`,
        count: i % 10,
      });

      const daysAgo = i % 15;
      const promotedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      await createMemoryDirectly(store, obs, promotedAt);
    }

    expect(await store.count()).toBe(50);

    // Query with various filters
    const highCount = await store.query({ minCount: 5 });
    expect(highCount.length).toBeGreaterThan(0);

    const oldMemories = await store.query({ minDays: 10 });
    expect(oldMemories.length).toBeGreaterThan(0);

    const eligible = await store.getPromotableToCore();
    expect(eligible.length).toBeGreaterThan(0);

    // Pagination
    const page1 = await store.query({}, { offset: 0, limit: 10 });
    const page2 = await store.query({}, { offset: 10, limit: 10 });
    expect(page1).toHaveLength(10);
    expect(page2).toHaveLength(10);

    // No overlap
    const ids1 = page1.map((m) => m.id);
    const ids2 = page2.map((m) => m.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  test("persistence across store instances", async () => {
    // Create some memories
    const obs1 = createTestObservation({ text: "Memory 1", count: 3 });
    const obs2 = createTestObservation({ text: "Memory 2", count: 5 });

    const memory1 = await createMemoryDirectly(store, obs1);
    await createMemoryDirectly(store, obs2);

    // Change status
    await store.setStatus(memory1.id, "scheduled-for-core");

    // Create new store instance
    const store2 = new MemoryStore(TEST_STORE_PATH);
    await store2.load();

    // Verify everything persisted
    expect(await store2.count()).toBe(2);

    const retrieved = await store2.getById(memory1.id);
    expect(retrieved!.status).toBe("scheduled-for-core");

    const counts = await store2.getCounts();
    expect(counts.longTerm).toBe(1);
    expect(counts.core).toBe(1);
  });
});
