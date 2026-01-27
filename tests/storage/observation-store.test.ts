/**
 * Tests for storage/observation-store.ts
 *
 * Comprehensive test suite covering:
 * - All CRUD operations
 * - Query with various filter combinations
 * - Pagination and sorting
 * - Bulk operations
 * - Atomic write behavior
 * - Session reference management
 * - Status transitions
 * - Edge cases and error handling
 * - Persistence across load/save cycles
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ObservationStore } from "../../src/storage/observation-store";
import type { Observation } from "../../src/core/types";
import { SanjError } from "../../src/core/types";

// Use a temporary directory for tests
let TEST_DIR: string;
let TEST_STORE_PATH: string;
let store: ObservationStore;

beforeEach(async () => {
  // Create unique test directory for each test
  TEST_DIR = join(tmpdir(), `sanj-test-obs-${Date.now()}-${Math.random()}`);
  TEST_STORE_PATH = join(TEST_DIR, "observations.json");

  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }

  // Create store instance
  store = new ObservationStore(TEST_STORE_PATH);
  await store.load();
});

afterEach(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// =============================================================================
// Lifecycle Tests
// =============================================================================

describe("ObservationStore - Lifecycle", () => {
  test("load() initializes empty store when file doesn't exist", async () => {
    const count = await store.count();
    expect(count).toBe(0);
  });

  test("load() reads existing file correctly", async () => {
    // Create some observations
    await store.create({
      text: "User prefers TypeScript",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await store.create({
      text: "User likes Bun framework",
      count: 2,
      status: "approved",
      sourceSessionIds: ["session-2"],
    });

    // Create new store instance and load
    const newStore = new ObservationStore(TEST_STORE_PATH);
    await newStore.load();

    const count = await newStore.count();
    expect(count).toBe(2);

    const all = await newStore.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].text).toBe("User prefers TypeScript");
    expect(all[1].text).toBe("User likes Bun framework");
  });

  test("load() throws on malformed JSON", async () => {
    // Write invalid JSON
    await Bun.write(TEST_STORE_PATH, "{ invalid json }");

    const newStore = new ObservationStore(TEST_STORE_PATH);
    await expect(newStore.load()).rejects.toThrow("Invalid JSON format");
  });

  test("save() creates file with proper format", async () => {
    await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    expect(existsSync(TEST_STORE_PATH)).toBe(true);

    const content = await Bun.file(TEST_STORE_PATH).text();
    const parsed = JSON.parse(content);

    expect(parsed.version).toBe(1);
    expect(parsed.observations).toHaveLength(1);
    expect(parsed.observations[0].text).toBe("Test observation");
  });

  test("save() uses atomic write pattern (no temp file left behind)", async () => {
    await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const tempPath = `${TEST_STORE_PATH}.tmp`;
    expect(existsSync(tempPath)).toBe(false);
  });

  test("save() creates parent directory if missing", async () => {
    // Remove test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    const newStore = new ObservationStore(TEST_STORE_PATH);
    await newStore.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    expect(existsSync(TEST_DIR)).toBe(true);
    expect(existsSync(TEST_STORE_PATH)).toBe(true);
  });

  test("count() returns correct number of observations", async () => {
    expect(await store.count()).toBe(0);

    await store.create({
      text: "Observation 1",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    expect(await store.count()).toBe(1);

    await store.create({
      text: "Observation 2",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    expect(await store.count()).toBe(2);
  });

  test("clear() removes all observations", async () => {
    await store.create({
      text: "Observation 1",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await store.create({
      text: "Observation 2",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    expect(await store.count()).toBe(2);

    await store.clear();

    expect(await store.count()).toBe(0);
  });

  test("data persists across multiple load/save cycles", async () => {
    // Create observation
    const created = await store.create({
      text: "Persistent observation",
      count: 5,
      status: "approved",
      sourceSessionIds: ["session-1", "session-2"],
      category: "preference",
      tags: ["typescript", "testing"],
    });

    // Load in new store
    const store2 = new ObservationStore(TEST_STORE_PATH);
    await store2.load();

    const loaded = await store2.getById(created.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.text).toBe("Persistent observation");
    expect(loaded!.count).toBe(5);
    expect(loaded!.status).toBe("approved");
    expect(loaded!.category).toBe("preference");
    expect(loaded!.tags).toEqual(["typescript", "testing"]);
    expect(loaded!.sourceSessionIds).toEqual(["session-1", "session-2"]);
  });
});

// =============================================================================
// Create Operations
// =============================================================================

describe("ObservationStore - Create", () => {
  test("create() generates unique ID", async () => {
    const obs1 = await store.create({
      text: "Observation 1",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const obs2 = await store.create({
      text: "Observation 2",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    expect(obs1.id).toBeDefined();
    expect(obs2.id).toBeDefined();
    expect(obs1.id).not.toBe(obs2.id);
  });

  test("create() sets firstSeen and lastSeen to current time", async () => {
    const before = new Date();
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });
    const after = new Date();

    expect(obs.firstSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(obs.firstSeen.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(obs.lastSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(obs.lastSeen.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("create() persists to disk immediately", async () => {
    await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    // Load in new store to verify persistence
    const newStore = new ObservationStore(TEST_STORE_PATH);
    await newStore.load();

    const count = await newStore.count();
    expect(count).toBe(1);
  });

  test("create() supports all optional fields", async () => {
    const obs = await store.create({
      text: "Complex observation",
      count: 3,
      status: "approved",
      sourceSessionIds: ["session-1", "session-2"],
      category: "workflow",
      tags: ["git", "testing"],
      metadata: { confidence: 0.95, source: "analysis" },
    });

    expect(obs.category).toBe("workflow");
    expect(obs.tags).toEqual(["git", "testing"]);
    expect(obs.metadata).toEqual({ confidence: 0.95, source: "analysis" });
  });

  test("bulkCreate() creates multiple observations efficiently", async () => {
    const observations = [
      {
        text: "Observation 1",
        count: 1,
        status: "pending" as const,
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Observation 2",
        count: 2,
        status: "approved" as const,
        sourceSessionIds: ["session-2"],
      },
      {
        text: "Observation 3",
        count: 3,
        status: "denied" as const,
        sourceSessionIds: ["session-3"],
      },
    ];

    const created = await store.bulkCreate(observations);

    expect(created).toHaveLength(3);
    expect(created[0].text).toBe("Observation 1");
    expect(created[1].text).toBe("Observation 2");
    expect(created[2].text).toBe("Observation 3");

    // Verify all have unique IDs
    const ids = new Set(created.map((o) => o.id));
    expect(ids.size).toBe(3);
  });

  test("bulkCreate() sets same timestamp for all observations", async () => {
    const observations = [
      {
        text: "Observation 1",
        count: 1,
        status: "pending" as const,
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Observation 2",
        count: 1,
        status: "pending" as const,
        sourceSessionIds: ["session-1"],
      },
    ];

    const created = await store.bulkCreate(observations);

    // All should have the same timestamp (created in same operation)
    expect(created[0].firstSeen.getTime()).toBe(created[1].firstSeen.getTime());
    expect(created[0].lastSeen.getTime()).toBe(created[1].lastSeen.getTime());
  });

  test("bulkCreate() persists all observations", async () => {
    const observations = Array.from({ length: 10 }, (_, i) => ({
      text: `Observation ${i}`,
      count: 1,
      status: "pending" as const,
      sourceSessionIds: ["session-1"],
    }));

    await store.bulkCreate(observations);

    const count = await store.count();
    expect(count).toBe(10);
  });
});

// =============================================================================
// Read Operations
// =============================================================================

describe("ObservationStore - Read", () => {
  test("getById() retrieves existing observation", async () => {
    const created = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const retrieved = await store.getById(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.text).toBe("Test observation");
  });

  test("getById() returns null for non-existent ID", async () => {
    const retrieved = await store.getById("non-existent-id");
    expect(retrieved).toBeNull();
  });

  test("getAll() returns all observations", async () => {
    await store.bulkCreate([
      {
        text: "Observation 1",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Observation 2",
        count: 1,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Observation 3",
        count: 1,
        status: "denied",
        sourceSessionIds: ["session-1"],
      },
    ]);

    const all = await store.getAll();
    expect(all).toHaveLength(3);
  });

  test("getAll() returns empty array when store is empty", async () => {
    const all = await store.getAll();
    expect(all).toEqual([]);
  });

  test("getPending() returns only pending observations", async () => {
    await store.bulkCreate([
      {
        text: "Pending 1",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Approved 1",
        count: 1,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Pending 2",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
    ]);

    const pending = await store.getPending();
    expect(pending).toHaveLength(2);
    expect(pending.every((o) => o.status === "pending")).toBe(true);
  });

  test("getApproved() returns only approved observations", async () => {
    await store.bulkCreate([
      {
        text: "Pending 1",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Approved 1",
        count: 1,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Approved 2",
        count: 1,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
    ]);

    const approved = await store.getApproved();
    expect(approved).toHaveLength(2);
    expect(approved.every((o) => o.status === "approved")).toBe(true);
  });

  test("getDenied() returns only denied observations", async () => {
    await store.bulkCreate([
      {
        text: "Pending 1",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Denied 1",
        count: 1,
        status: "denied",
        sourceSessionIds: ["session-1"],
      },
    ]);

    const denied = await store.getDenied();
    expect(denied).toHaveLength(1);
    expect(denied.every((o) => o.status === "denied")).toBe(true);
  });

  test("getByStatus() works for all status values", async () => {
    await store.bulkCreate([
      {
        text: "Pending",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Approved",
        count: 1,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Denied",
        count: 1,
        status: "denied",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Promoted to LT",
        count: 1,
        status: "promoted-to-long-term",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Promoted to Core",
        count: 1,
        status: "promoted-to-core",
        sourceSessionIds: ["session-1"],
      },
    ]);

    expect(await store.getByStatus("pending")).toHaveLength(1);
    expect(await store.getByStatus("approved")).toHaveLength(1);
    expect(await store.getByStatus("denied")).toHaveLength(1);
    expect(await store.getByStatus("promoted-to-long-term")).toHaveLength(1);
    expect(await store.getByStatus("promoted-to-core")).toHaveLength(1);
  });
});

// =============================================================================
// Query Operations
// =============================================================================

describe("ObservationStore - Query", () => {
  beforeEach(async () => {
    // Create test dataset
    await store.bulkCreate([
      {
        text: "TypeScript preference",
        count: 5,
        status: "approved",
        sourceSessionIds: ["session-1", "session-2"],
        category: "preference",
        tags: ["typescript"],
      },
      {
        text: "Git workflow",
        count: 3,
        status: "pending",
        sourceSessionIds: ["session-3"],
        category: "workflow",
        tags: ["git", "version-control"],
      },
      {
        text: "Testing pattern",
        count: 7,
        status: "approved",
        sourceSessionIds: ["session-2", "session-4"],
        category: "pattern",
        tags: ["testing", "bun"],
      },
      {
        text: "Old observation",
        count: 1,
        status: "denied",
        sourceSessionIds: ["session-5"],
        category: "other",
      },
    ]);
  });

  test("query() filters by single status", async () => {
    const results = await store.query({ status: "approved" });
    expect(results).toHaveLength(2);
    expect(results.every((o) => o.status === "approved")).toBe(true);
  });

  test("query() filters by multiple statuses", async () => {
    const results = await store.query({
      status: ["approved", "pending"],
    });
    expect(results).toHaveLength(3);
    expect(results.every((o) => o.status === "approved" || o.status === "pending")).toBe(
      true
    );
  });

  test("query() filters by countThreshold", async () => {
    const results = await store.query({ countThreshold: 5 });
    expect(results).toHaveLength(2);
    expect(results.every((o) => o.count >= 5)).toBe(true);
  });

  test("query() filters by category", async () => {
    const results = await store.query({ category: "workflow" });
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("workflow");
  });

  test("query() filters by tags (OR logic)", async () => {
    const results = await store.query({ tags: ["typescript", "git"] });
    expect(results).toHaveLength(2);
  });

  test("query() filters by sessionIds (OR logic)", async () => {
    const results = await store.query({ sessionIds: ["session-2"] });
    expect(results).toHaveLength(2);
    expect(
      results.every((o) => o.sourceSessionIds.includes("session-2"))
    ).toBe(true);
  });

  test("query() filters by date range on lastSeen", async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const results = await store.query({
      dateRange: {
        start: oneHourAgo,
        end: oneHourFromNow,
        field: "lastSeen",
      },
    });

    // All observations should be within range (just created)
    expect(results).toHaveLength(4);
  });

  test("query() filters by date range on firstSeen", async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const results = await store.query({
      dateRange: {
        start: oneHourAgo,
        field: "firstSeen",
      },
    });

    expect(results).toHaveLength(4);
  });

  test("query() combines multiple filters (AND logic)", async () => {
    const results = await store.query({
      status: "approved",
      countThreshold: 5,
      category: "preference",
    });

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("TypeScript preference");
  });

  test("query() returns empty array when no matches", async () => {
    const results = await store.query({
      status: "pending",
      countThreshold: 100,
    });

    expect(results).toEqual([]);
  });

  test("query() with pagination", async () => {
    const page1 = await store.query({}, { offset: 0, limit: 2 });
    const page2 = await store.query({}, { offset: 2, limit: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);

    // Verify no overlap
    const ids1 = page1.map((o) => o.id);
    const ids2 = page2.map((o) => o.id);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test("query() with sorting by count ascending", async () => {
    const results = await store.query(
      {},
      undefined,
      { field: "count", direction: "asc" }
    );

    expect(results).toHaveLength(4);
    expect(results[0].count).toBe(1);
    expect(results[1].count).toBe(3);
    expect(results[2].count).toBe(5);
    expect(results[3].count).toBe(7);
  });

  test("query() with sorting by count descending", async () => {
    const results = await store.query(
      {},
      undefined,
      { field: "count", direction: "desc" }
    );

    expect(results).toHaveLength(4);
    expect(results[0].count).toBe(7);
    expect(results[1].count).toBe(5);
    expect(results[2].count).toBe(3);
    expect(results[3].count).toBe(1);
  });

  test("query() with sorting by lastSeen", async () => {
    const results = await store.query(
      {},
      undefined,
      { field: "lastSeen", direction: "desc" }
    );

    expect(results).toHaveLength(4);
    // All should have valid dates
    results.forEach((o) => {
      expect(o.lastSeen).toBeInstanceOf(Date);
    });
  });

  test("query() with pagination and sorting", async () => {
    const results = await store.query(
      {},
      { offset: 1, limit: 2 },
      { field: "count", direction: "desc" }
    );

    expect(results).toHaveLength(2);
    expect(results[0].count).toBe(5);
    expect(results[1].count).toBe(3);
  });

  test("filter() with custom predicate", async () => {
    const results = await store.filter(
      (obs) => obs.count > 3 && obs.status === "approved"
    );

    expect(results).toHaveLength(2);
    expect(results.every((o) => o.count > 3 && o.status === "approved")).toBe(true);
  });

  test("filter() returns empty array when no matches", async () => {
    const results = await store.filter((obs) => obs.count > 100);
    expect(results).toEqual([]);
  });
});

// =============================================================================
// Update Operations
// =============================================================================

describe("ObservationStore - Update", () => {
  test("incrementCount() increases count and updates lastSeen", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const originalLastSeen = obs.lastSeen;

    // Wait a tiny bit to ensure timestamp changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await store.incrementCount(obs.id);

    expect(updated.count).toBe(2);
    expect(updated.lastSeen.getTime()).toBeGreaterThan(originalLastSeen.getTime());
  });

  test("incrementCount() supports custom increment", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const updated = await store.incrementCount(obs.id, 5);
    expect(updated.count).toBe(6);
  });

  test("incrementCount() throws on non-existent ID", async () => {
    await expect(store.incrementCount("non-existent")).rejects.toThrow(SanjError);
  });

  test("incrementCount() persists changes", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await store.incrementCount(obs.id);

    const retrieved = await store.getById(obs.id);
    expect(retrieved!.count).toBe(2);
  });

  test("updateLastSeen() updates timestamp", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const originalLastSeen = obs.lastSeen;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await store.updateLastSeen(obs.id);

    expect(updated.lastSeen.getTime()).toBeGreaterThan(originalLastSeen.getTime());
  });

  test("updateLastSeen() throws on non-existent ID", async () => {
    await expect(store.updateLastSeen("non-existent")).rejects.toThrow(SanjError);
  });

  test("setStatus() changes observation status", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const updated = await store.setStatus(obs.id, "approved");
    expect(updated.status).toBe("approved");

    const retrieved = await store.getById(obs.id);
    expect(retrieved!.status).toBe("approved");
  });

  test("setStatus() supports all status transitions", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await store.setStatus(obs.id, "approved");
    let retrieved = await store.getById(obs.id);
    expect(retrieved!.status).toBe("approved");

    await store.setStatus(obs.id, "promoted-to-long-term");
    retrieved = await store.getById(obs.id);
    expect(retrieved!.status).toBe("promoted-to-long-term");

    await store.setStatus(obs.id, "promoted-to-core");
    retrieved = await store.getById(obs.id);
    expect(retrieved!.status).toBe("promoted-to-core");

    await store.setStatus(obs.id, "denied");
    retrieved = await store.getById(obs.id);
    expect(retrieved!.status).toBe("denied");
  });

  test("setStatus() throws on non-existent ID", async () => {
    await expect(store.setStatus("non-existent", "approved")).rejects.toThrow(SanjError);
  });

  test("addSessionRef() adds session ID", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const updated = await store.addSessionRef(obs.id, "session-2");

    expect(updated.sourceSessionIds).toContain("session-1");
    expect(updated.sourceSessionIds).toContain("session-2");
    expect(updated.sourceSessionIds).toHaveLength(2);
  });

  test("addSessionRef() prevents duplicate session IDs", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await store.addSessionRef(obs.id, "session-1");

    const retrieved = await store.getById(obs.id);
    expect(retrieved!.sourceSessionIds).toEqual(["session-1"]);
  });

  test("addSessionRef() throws on non-existent ID", async () => {
    await expect(store.addSessionRef("non-existent", "session-1")).rejects.toThrow(
      SanjError
    );
  });

  test("update() modifies observation fields", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const updated = await store.update(obs.id, {
      text: "Updated observation",
      count: 5,
      status: "approved",
      category: "preference",
      tags: ["new-tag"],
    });

    expect(updated.text).toBe("Updated observation");
    expect(updated.count).toBe(5);
    expect(updated.status).toBe("approved");
    expect(updated.category).toBe("preference");
    expect(updated.tags).toEqual(["new-tag"]);
  });

  test("update() preserves protected fields (id, firstSeen)", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const originalId = obs.id;
    const originalFirstSeen = obs.firstSeen;

    await store.update(obs.id, {
      id: "should-be-ignored",
      firstSeen: new Date("2020-01-01"),
    } as any);

    const retrieved = await store.getById(originalId);
    expect(retrieved!.id).toBe(originalId);
    expect(retrieved!.firstSeen).toEqual(originalFirstSeen);
  });

  test("update() throws on non-existent ID", async () => {
    await expect(store.update("non-existent", { count: 5 })).rejects.toThrow(SanjError);
  });

  test("bulkUpdate() updates multiple observations", async () => {
    const obs1 = await store.create({
      text: "Observation 1",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const obs2 = await store.create({
      text: "Observation 2",
      count: 2,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const updated = await store.bulkUpdate([
      { id: obs1.id, partial: { status: "approved" as const } },
      { id: obs2.id, partial: { status: "denied" as const } },
    ]);

    expect(updated).toHaveLength(2);
    expect(updated[0].status).toBe("approved");
    expect(updated[1].status).toBe("denied");
  });

  test("bulkUpdate() throws if any ID not found", async () => {
    const obs = await store.create({
      text: "Observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await expect(
      store.bulkUpdate([
        { id: obs.id, partial: { status: "approved" as const } },
        { id: "non-existent", partial: { status: "denied" as const } },
      ])
    ).rejects.toThrow(SanjError);
  });

  test("bulkUpdate() is atomic (all or nothing)", async () => {
    const obs1 = await store.create({
      text: "Observation 1",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const obs2 = await store.create({
      text: "Observation 2",
      count: 2,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    try {
      await store.bulkUpdate([
        { id: obs1.id, partial: { status: "approved" as const } },
        { id: "non-existent", partial: { status: "denied" as const } },
      ]);
    } catch {
      // Expected to fail
    }

    // First observation should not have been updated
    const retrieved = await store.getById(obs1.id);
    expect(retrieved!.status).toBe("pending");
  });
});

// =============================================================================
// Delete Operations
// =============================================================================

describe("ObservationStore - Delete", () => {
  test("delete() removes observation", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const deleted = await store.delete(obs.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getById(obs.id);
    expect(retrieved).toBeNull();
  });

  test("delete() returns false for non-existent ID", async () => {
    const deleted = await store.delete("non-existent");
    expect(deleted).toBe(false);
  });

  test("delete() persists changes", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    await store.delete(obs.id);

    const newStore = new ObservationStore(TEST_STORE_PATH);
    await newStore.load();

    const retrieved = await newStore.getById(obs.id);
    expect(retrieved).toBeNull();
  });

  test("deleteByStatus() removes all matching observations", async () => {
    await store.bulkCreate([
      {
        text: "Pending 1",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Approved 1",
        count: 1,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Pending 2",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
    ]);

    const deleted = await store.deleteByStatus("pending");
    expect(deleted).toBe(2);

    const remaining = await store.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("approved");
  });

  test("deleteByStatus() returns 0 when no matches", async () => {
    const deleted = await store.deleteByStatus("pending");
    expect(deleted).toBe(0);
  });
});

// =============================================================================
// Special Operations
// =============================================================================

describe("ObservationStore - Special", () => {
  test("getPromotable() returns approved observations", async () => {
    await store.bulkCreate([
      {
        text: "Approved 1",
        count: 5,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Pending 1",
        count: 10,
        status: "pending",
        sourceSessionIds: ["session-1"],
      },
      {
        text: "Approved 2",
        count: 3,
        status: "approved",
        sourceSessionIds: ["session-1"],
      },
    ]);

    const promotable = await store.getPromotable();
    expect(promotable).toHaveLength(2);
    expect(promotable.every((o) => o.status === "approved")).toBe(true);
  });

  test("findSimilar() returns null (placeholder)", async () => {
    const obs = await store.create({
      text: "Test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    const similar = await store.findSimilar(obs);
    expect(similar).toBeNull();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("ObservationStore - Integration", () => {
  test("complete lifecycle: create → update → query → delete", async () => {
    // Create
    const obs = await store.create({
      text: "Integration test observation",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
      category: "workflow",
    });

    expect(obs.id).toBeDefined();

    // Update
    await store.incrementCount(obs.id, 2);
    await store.setStatus(obs.id, "approved");
    await store.addSessionRef(obs.id, "session-2");

    // Query
    const results = await store.query({
      status: "approved",
      category: "workflow",
      countThreshold: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(obs.id);
    expect(results[0].count).toBe(3);
    expect(results[0].sourceSessionIds).toHaveLength(2);

    // Delete
    const deleted = await store.delete(obs.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getById(obs.id);
    expect(retrieved).toBeNull();
  });

  test("status transition workflow", async () => {
    const obs = await store.create({
      text: "Status transition test",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    // Pending → Approved
    await store.setStatus(obs.id, "approved");
    let pending = await store.getPending();
    let approved = await store.getApproved();
    expect(pending).toHaveLength(0);
    expect(approved).toHaveLength(1);

    // Approved → Promoted to Long-Term
    await store.setStatus(obs.id, "promoted-to-long-term");
    approved = await store.getApproved();
    expect(approved).toHaveLength(0);

    // Promoted to Long-Term → Promoted to Core
    await store.setStatus(obs.id, "promoted-to-core");
    const promotedToCore = await store.getByStatus("promoted-to-core");
    expect(promotedToCore).toHaveLength(1);
  });

  test("concurrent observations with different categories", async () => {
    await store.bulkCreate([
      {
        text: "Prefers TypeScript",
        count: 5,
        status: "approved",
        sourceSessionIds: ["session-1"],
        category: "preference",
      },
      {
        text: "Uses Git rebase workflow",
        count: 3,
        status: "approved",
        sourceSessionIds: ["session-1"],
        category: "workflow",
      },
      {
        text: "Factory pattern usage",
        count: 2,
        status: "approved",
        sourceSessionIds: ["session-1"],
        category: "pattern",
      },
      {
        text: "Chooses Bun for testing",
        count: 4,
        status: "approved",
        sourceSessionIds: ["session-1"],
        category: "tool-choice",
      },
    ]);

    const preferences = await store.query({ category: "preference" });
    const workflows = await store.query({ category: "workflow" });
    const patterns = await store.query({ category: "pattern" });
    const toolChoices = await store.query({ category: "tool-choice" });

    expect(preferences).toHaveLength(1);
    expect(workflows).toHaveLength(1);
    expect(patterns).toHaveLength(1);
    expect(toolChoices).toHaveLength(1);
  });

  test("session tracking across multiple sessions", async () => {
    const obs = await store.create({
      text: "Cross-session pattern",
      count: 1,
      status: "pending",
      sourceSessionIds: ["session-1"],
    });

    // Simulate seeing same pattern in different sessions
    await store.addSessionRef(obs.id, "session-2");
    await store.incrementCount(obs.id);

    await store.addSessionRef(obs.id, "session-3");
    await store.incrementCount(obs.id);

    const retrieved = await store.getById(obs.id);
    expect(retrieved!.sourceSessionIds).toHaveLength(3);
    expect(retrieved!.count).toBe(3);
  });

  test("handles large dataset efficiently", async () => {
    // Create 100 observations
    const observations = Array.from({ length: 100 }, (_, i) => ({
      text: `Observation ${i}`,
      count: i,
      status: (i % 2 === 0 ? "approved" : "pending") as const,
      sourceSessionIds: [`session-${i % 10}`],
      category: (["preference", "workflow", "pattern", "tool-choice", "style"] as const)[
        i % 5
      ],
    }));

    await store.bulkCreate(observations);

    // Query with various filters
    const approved = await store.query({ status: "approved" });
    expect(approved).toHaveLength(50);

    const highCount = await store.query({ countThreshold: 50 });
    expect(highCount.length).toBeGreaterThan(0);

    const workflows = await store.query({ category: "workflow" });
    expect(workflows).toHaveLength(20);

    // Pagination
    const page1 = await store.query({}, { offset: 0, limit: 25 });
    const page2 = await store.query({}, { offset: 25, limit: 25 });
    expect(page1).toHaveLength(25);
    expect(page2).toHaveLength(25);
  });
});
