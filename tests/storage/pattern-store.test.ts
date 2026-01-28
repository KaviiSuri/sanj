/**
 * Pattern Store Tests
 *
 * Comprehensive test suite for the FilePatternStore implementation.
 * Tests cover all CRUD operations, querying with filters, expiration
 * logic, persistence, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import type { Observation } from "../../src/core/types.ts";
import { SanjError } from "../../src/core/types.ts";
import { FilePatternStore } from "../../src/storage/pattern-store.ts";

// Test constants
const TEST_STORAGE_DIR = join(process.cwd(), ".test-patterns");
const TEST_STORAGE_PATH = join(TEST_STORAGE_DIR, "patterns.json");

// Helper: Create a test pattern (Observation)
function createTestPattern(overrides: Partial<Observation> = {}): Observation {
  const now = new Date();
  return {
    id: overrides.id || crypto.randomUUID(),
    text: overrides.text || `Test pattern ${crypto.randomUUID().slice(0, 8)}`,
    category: overrides.category || "pattern",
    count: overrides.count || 1,
    status: overrides.status || "approved",
    sourceSessionIds: overrides.sourceSessionIds || [crypto.randomUUID()],
    firstSeen: overrides.firstSeen || now,
    lastSeen: overrides.lastSeen || now,
    tags: overrides.tags,
    metadata: overrides.metadata,
  };
}

// Helper: Create a pattern with a specific age (days ago)
function createAgedPattern(daysAgo: number, overrides: Partial<Observation> = {}): Observation {
  const now = new Date();
  const aged = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return createTestPattern({
    firstSeen: aged,
    lastSeen: aged,
    ...overrides,
  });
}

// Helper: Clean up test storage
function cleanupTestStorage() {
  if (existsSync(TEST_STORAGE_PATH)) {
    try {
      unlinkSync(TEST_STORAGE_PATH);
    } catch {
      // Ignore cleanup errors
    }
  }
}

describe("FilePatternStore", () => {
  let store: FilePatternStore;

  beforeEach(async () => {
    cleanupTestStorage();
    store = new FilePatternStore(TEST_STORAGE_PATH);
    await store.load();
  });

  afterEach(() => {
    cleanupTestStorage();
  });

  // ===========================================================================
  // Lifecycle Methods
  // ===========================================================================

  describe("Lifecycle Methods", () => {
    it("should initialize empty store on first load", async () => {
      const count = await store.count();
      expect(count).toBe(0);
    });

    it("should persist patterns across load/save cycles", async () => {
      const pattern = createTestPattern({ id: "persist-test" });
      await store.savePattern(pattern);

      // New instance simulates app restart
      const newStore = new FilePatternStore(TEST_STORAGE_PATH);
      await newStore.load();

      const loaded = await newStore.getById("persist-test");
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe("persist-test");
      expect(loaded!.text).toBe(pattern.text);
    });

    it("should handle missing storage file gracefully", async () => {
      const newStore = new FilePatternStore("/nonexistent/path/patterns.json");
      await newStore.load();
      const count = await newStore.count();
      expect(count).toBe(0);
    });

    it("should throw on corrupted JSON", async () => {
      // Write invalid JSON
      await Bun.write(TEST_STORAGE_PATH, "not valid json {{{");

      const newStore = new FilePatternStore(TEST_STORAGE_PATH);
      try {
        await newStore.load();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(SanjError);
      }
    });

    it("should deserialize Date fields correctly", async () => {
      const now = new Date();
      const pattern = createTestPattern({ id: "date-test", firstSeen: now, lastSeen: now });
      await store.savePattern(pattern);

      const newStore = new FilePatternStore(TEST_STORAGE_PATH);
      await newStore.load();

      const loaded = await newStore.getById("date-test");
      expect(loaded!.firstSeen).toBeInstanceOf(Date);
      expect(loaded!.lastSeen).toBeInstanceOf(Date);
      expect(loaded!.firstSeen.getTime()).toBe(now.getTime());
      expect(loaded!.lastSeen.getTime()).toBe(now.getTime());
    });

    it("should clear all patterns", async () => {
      await store.savePattern(createTestPattern({ id: "clear-1" }));
      await store.savePattern(createTestPattern({ id: "clear-2" }));
      expect(await store.count()).toBe(2);

      await store.clear();
      expect(await store.count()).toBe(0);
    });

    it("should clear persists to disk", async () => {
      await store.savePattern(createTestPattern({ id: "clear-persist" }));
      await store.clear();

      const newStore = new FilePatternStore(TEST_STORAGE_PATH);
      await newStore.load();
      expect(await newStore.count()).toBe(0);
    });
  });

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  describe("Write Operations", () => {
    it("should save a single pattern", async () => {
      const pattern = createTestPattern({ id: "single-save" });
      const result = await store.savePattern(pattern);

      expect(result.id).toBe("single-save");
      expect(await store.count()).toBe(1);
    });

    it("should save multiple patterns in one call", async () => {
      const patterns = [
        createTestPattern({ id: "batch-1" }),
        createTestPattern({ id: "batch-2" }),
        createTestPattern({ id: "batch-3" }),
      ];

      const results = await store.savePatterns(patterns);
      expect(results).toHaveLength(3);
      expect(await store.count()).toBe(3);
    });

    it("should replace existing pattern with same ID", async () => {
      const original = createTestPattern({ id: "replace-test", text: "original text" });
      await store.savePattern(original);

      const updated = createTestPattern({ id: "replace-test", text: "updated text" });
      await store.savePattern(updated);

      expect(await store.count()).toBe(1);
      const loaded = await store.getById("replace-test");
      expect(loaded!.text).toBe("updated text");
    });

    it("should handle empty batch save", async () => {
      const results = await store.savePatterns([]);
      expect(results).toHaveLength(0);
      expect(await store.count()).toBe(0);
    });
  });

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  describe("Read Operations", () => {
    it("should get pattern by ID", async () => {
      const pattern = createTestPattern({ id: "get-by-id", text: "findable" });
      await store.savePattern(pattern);

      const result = await store.getById("get-by-id");
      expect(result).not.toBeNull();
      expect(result!.text).toBe("findable");
    });

    it("should return null for missing ID", async () => {
      const result = await store.getById("nonexistent-id");
      expect(result).toBeNull();
    });

    it("should getAll excluding expired by default", async () => {
      await store.savePattern(createTestPattern({ id: "fresh" }));
      await store.savePattern(createAgedPattern(45, { id: "expired" }));

      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe("fresh");
    });

    it("should getAll including expired when requested", async () => {
      await store.savePattern(createTestPattern({ id: "fresh2" }));
      await store.savePattern(createAgedPattern(45, { id: "expired2" }));

      const all = await store.getAll(true);
      expect(all).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  describe("Query - Category Filter", () => {
    it("should filter by single category", async () => {
      await store.savePatterns([
        createTestPattern({ id: "cat-pattern", category: "pattern" }),
        createTestPattern({ id: "cat-workflow", category: "workflow" }),
        createTestPattern({ id: "cat-pref", category: "preference" }),
      ]);

      const results = await store.query({ category: "workflow" });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("cat-workflow");
    });

    it("should filter by multiple categories", async () => {
      await store.savePatterns([
        createTestPattern({ id: "multi-1", category: "pattern" }),
        createTestPattern({ id: "multi-2", category: "workflow" }),
        createTestPattern({ id: "multi-3", category: "preference" }),
      ]);

      const results = await store.query({ category: ["pattern", "workflow"] });
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(["multi-1", "multi-2"]);
    });

    it("should return empty when no patterns match category", async () => {
      await store.savePattern(createTestPattern({ category: "pattern" }));
      const results = await store.query({ category: "style" });
      expect(results).toHaveLength(0);
    });
  });

  describe("Query - Count Filter", () => {
    it("should filter by minimum count", async () => {
      await store.savePatterns([
        createTestPattern({ id: "count-1", count: 1 }),
        createTestPattern({ id: "count-3", count: 3 }),
        createTestPattern({ id: "count-5", count: 5 }),
      ]);

      const results = await store.query({ minCount: 3 });
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(["count-3", "count-5"]);
    });

    it("should include exact match on minCount boundary", async () => {
      await store.savePattern(createTestPattern({ id: "boundary", count: 3 }));
      const results = await store.query({ minCount: 3 });
      expect(results).toHaveLength(1);
    });
  });

  describe("Query - Date Range Filter", () => {
    it("should filter by date range on lastSeen", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      await store.savePatterns([
        createTestPattern({ id: "date-recent", lastSeen: now }),
        createTestPattern({ id: "date-yesterday", lastSeen: yesterday }),
        createTestPattern({ id: "date-week", lastSeen: weekAgo }),
      ]);

      // Query for patterns seen in the last 3 days
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const results = await store.query({ dateRange: { start: threeDaysAgo } });
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(["date-recent", "date-yesterday"]);
    });

    it("should filter with end date", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      await store.savePatterns([
        createTestPattern({ id: "end-recent", lastSeen: now }),
        createTestPattern({ id: "end-yesterday", lastSeen: yesterday }),
      ]);

      // Only patterns seen before yesterday
      const results = await store.query({ dateRange: { end: twoDaysAgo } });
      expect(results).toHaveLength(0);
    });

    it("should filter with both start and end date", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      await store.savePatterns([
        createTestPattern({ id: "range-now", lastSeen: now }),
        createTestPattern({ id: "range-yesterday", lastSeen: yesterday }),
        createTestPattern({ id: "range-two", lastSeen: twoDaysAgo }),
        createTestPattern({ id: "range-three", lastSeen: threeDaysAgo }),
      ]);

      // Between 2.5 and 0.5 days ago
      const halfDay = 12 * 60 * 60 * 1000;
      const results = await store.query({
        dateRange: {
          start: new Date(now.getTime() - 2.5 * 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() - halfDay),
        },
      });
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(["range-two", "range-yesterday"]);
    });
  });

  describe("Query - Tags Filter", () => {
    it("should filter by tags (OR logic)", async () => {
      await store.savePatterns([
        createTestPattern({ id: "tag-1", tags: ["important", "frequent"] }),
        createTestPattern({ id: "tag-2", tags: ["important"] }),
        createTestPattern({ id: "tag-3", tags: ["rare"] }),
      ]);

      const results = await store.query({ tags: ["frequent"] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("tag-1");
    });

    it("should match any tag in the filter list", async () => {
      await store.savePatterns([
        createTestPattern({ id: "or-1", tags: ["tagA"] }),
        createTestPattern({ id: "or-2", tags: ["tagB"] }),
        createTestPattern({ id: "or-3", tags: ["tagC"] }),
      ]);

      const results = await store.query({ tags: ["tagA", "tagC"] });
      expect(results).toHaveLength(2);
    });

    it("should exclude patterns without tags when tag filter is set", async () => {
      await store.savePatterns([
        createTestPattern({ id: "no-tags" }),
        createTestPattern({ id: "has-tags", tags: ["match"] }),
      ]);

      const results = await store.query({ tags: ["match"] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("has-tags");
    });
  });

  describe("Query - Session ID Filter", () => {
    it("should filter by source session IDs", async () => {
      await store.savePatterns([
        createTestPattern({ id: "sess-1", sourceSessionIds: ["session-a", "session-b"] }),
        createTestPattern({ id: "sess-2", sourceSessionIds: ["session-c"] }),
      ]);

      const results = await store.query({ sessionIds: ["session-a"] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("sess-1");
    });

    it("should OR session IDs", async () => {
      await store.savePatterns([
        createTestPattern({ id: "or-sess-1", sourceSessionIds: ["s1"] }),
        createTestPattern({ id: "or-sess-2", sourceSessionIds: ["s2"] }),
        createTestPattern({ id: "or-sess-3", sourceSessionIds: ["s3"] }),
      ]);

      const results = await store.query({ sessionIds: ["s1", "s3"] });
      expect(results).toHaveLength(2);
    });
  });

  describe("Query - Expiration Exclusion", () => {
    it("should exclude expired patterns by default", async () => {
      const store30 = new FilePatternStore(TEST_STORAGE_PATH, 30);
      await store30.load();

      await store30.savePatterns([
        createTestPattern({ id: "q-fresh" }),
        createAgedPattern(45, { id: "q-expired" }),
      ]);

      const results = await store30.query({});
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("q-fresh");
    });

    it("should include expired when includeExpired is true", async () => {
      const store30 = new FilePatternStore(TEST_STORAGE_PATH, 30);
      await store30.load();

      await store30.savePatterns([
        createTestPattern({ id: "inc-fresh" }),
        createAgedPattern(45, { id: "inc-expired" }),
      ]);

      const results = await store30.query({ includeExpired: true });
      expect(results).toHaveLength(2);
    });
  });

  describe("Query - Combined Filters", () => {
    it("should AND multiple filters together", async () => {
      await store.savePatterns([
        createTestPattern({ id: "combo-1", category: "workflow", count: 5, tags: ["frequent"] }),
        createTestPattern({ id: "combo-2", category: "workflow", count: 1, tags: ["frequent"] }),
        createTestPattern({ id: "combo-3", category: "pattern", count: 5, tags: ["frequent"] }),
        createTestPattern({ id: "combo-4", category: "workflow", count: 5, tags: ["rare"] }),
      ]);

      const results = await store.query({
        category: "workflow",
        minCount: 3,
        tags: ["frequent"],
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("combo-1");
    });

    it("should return empty array when no combination matches", async () => {
      await store.savePattern(createTestPattern({ category: "pattern", count: 1 }));
      const results = await store.query({ category: "workflow", minCount: 10 });
      expect(results).toHaveLength(0);
    });
  });

  describe("Query - Sorting", () => {
    it("should sort by count ascending", async () => {
      await store.savePatterns([
        createTestPattern({ id: "sort-3", count: 3 }),
        createTestPattern({ id: "sort-1", count: 1 }),
        createTestPattern({ id: "sort-5", count: 5 }),
      ]);

      const results = await store.query(
        {},
        undefined,
        { field: "count", direction: "asc" }
      );
      expect(results.map((r) => r.id)).toEqual(["sort-1", "sort-3", "sort-5"]);
    });

    it("should sort by count descending", async () => {
      await store.savePatterns([
        createTestPattern({ id: "desc-1", count: 1 }),
        createTestPattern({ id: "desc-5", count: 5 }),
        createTestPattern({ id: "desc-3", count: 3 }),
      ]);

      const results = await store.query(
        {},
        undefined,
        { field: "count", direction: "desc" }
      );
      expect(results.map((r) => r.id)).toEqual(["desc-5", "desc-3", "desc-1"]);
    });

    it("should sort by lastSeen descending", async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      await store.savePatterns([
        createTestPattern({ id: "time-old", lastSeen: twoHoursAgo }),
        createTestPattern({ id: "time-new", lastSeen: now }),
        createTestPattern({ id: "time-mid", lastSeen: oneHourAgo }),
      ]);

      const results = await store.query(
        {},
        undefined,
        { field: "lastSeen", direction: "desc" }
      );
      expect(results.map((r) => r.id)).toEqual(["time-new", "time-mid", "time-old"]);
    });
  });

  describe("Query - Pagination", () => {
    it("should apply offset and limit", async () => {
      const patterns = Array.from({ length: 5 }, (_, i) =>
        createTestPattern({ id: `page-${i}`, count: i + 1 })
      );
      await store.savePatterns(patterns);

      const results = await store.query(
        {},
        { offset: 1, limit: 2 },
        { field: "count", direction: "asc" }
      );
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("page-1");
      expect(results[1].id).toBe("page-2");
    });

    it("should handle offset beyond available items", async () => {
      await store.savePattern(createTestPattern({ id: "single" }));
      const results = await store.query({}, { offset: 10, limit: 5 });
      expect(results).toHaveLength(0);
    });

    it("should handle limit of 0 returning no results", async () => {
      await store.savePattern(createTestPattern({ id: "zero-limit" }));
      const results = await store.query({}, { offset: 0, limit: 0 });
      expect(results).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Expiration Logic
  // ===========================================================================

  describe("Expiration Logic", () => {
    it("should correctly identify expired patterns (default 30 days)", async () => {
      const fresh = createTestPattern({ id: "exp-fresh" });
      const expired = createAgedPattern(45, { id: "exp-expired" });

      expect(store.isExpired(fresh)).toBe(false);
      expect(store.isExpired(expired)).toBe(true);
    });

    it("should respect custom expiration days", async () => {
      const shortStore = new FilePatternStore(TEST_STORAGE_PATH, 7);
      const tenDaysAgo = createAgedPattern(10, { id: "short-exp" });

      expect(shortStore.isExpired(tenDaysAgo)).toBe(true);

      const longStore = new FilePatternStore(TEST_STORAGE_PATH, 90);
      expect(longStore.isExpired(tenDaysAgo)).toBe(false);
    });

    it("should not expire patterns seen today", async () => {
      const today = createTestPattern({ id: "today" });
      expect(store.isExpired(today)).toBe(false);
    });

    it("should not expire patterns seen exactly at the boundary", async () => {
      // Exactly 30 days should not be expired (> not >=)
      const boundary = createAgedPattern(30, { id: "boundary-exp" });
      expect(store.isExpired(boundary)).toBe(false);
    });

    it("should expire patterns just past the boundary", async () => {
      const justPast = createAgedPattern(31, { id: "past-boundary" });
      expect(store.isExpired(justPast)).toBe(true);
    });

    it("should getExpired returns only expired patterns", async () => {
      await store.savePatterns([
        createTestPattern({ id: "get-exp-fresh" }),
        createAgedPattern(45, { id: "get-exp-old" }),
        createAgedPattern(60, { id: "get-exp-older" }),
      ]);

      const expired = await store.getExpired();
      expect(expired).toHaveLength(2);
      expect(expired.map((p) => p.id).sort()).toEqual(["get-exp-old", "get-exp-older"]);
    });

    it("should purgeExpired removes only expired patterns", async () => {
      await store.savePatterns([
        createTestPattern({ id: "purge-fresh" }),
        createAgedPattern(45, { id: "purge-old" }),
        createAgedPattern(60, { id: "purge-older" }),
      ]);

      const purgeCount = await store.purgeExpired();
      expect(purgeCount).toBe(2);
      expect(await store.count()).toBe(1);

      const remaining = await store.getById("purge-fresh");
      expect(remaining).not.toBeNull();
      expect(remaining!.id).toBe("purge-fresh");
    });

    it("should purgeExpired persists to disk", async () => {
      await store.savePatterns([
        createTestPattern({ id: "persist-purge-fresh" }),
        createAgedPattern(45, { id: "persist-purge-old" }),
      ]);

      await store.purgeExpired();

      const newStore = new FilePatternStore(TEST_STORAGE_PATH);
      await newStore.load();
      expect(await newStore.count()).toBe(1);
    });

    it("should purgeExpired return 0 when nothing to purge", async () => {
      await store.savePattern(createTestPattern({ id: "nothing-to-purge" }));
      const purgeCount = await store.purgeExpired();
      expect(purgeCount).toBe(0);
    });
  });

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  describe("Delete Operations", () => {
    it("should delete pattern by ID", async () => {
      await store.savePattern(createTestPattern({ id: "del-1" }));
      const result = await store.delete("del-1");

      expect(result).toBe(true);
      expect(await store.getById("del-1")).toBeNull();
      expect(await store.count()).toBe(0);
    });

    it("should return false when deleting nonexistent pattern", async () => {
      const result = await store.delete("nonexistent");
      expect(result).toBe(false);
    });

    it("should persist deletion to disk", async () => {
      await store.savePattern(createTestPattern({ id: "del-persist" }));
      await store.delete("del-persist");

      const newStore = new FilePatternStore(TEST_STORAGE_PATH);
      await newStore.load();
      expect(await newStore.getById("del-persist")).toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("should handle pattern with all optional fields undefined", async () => {
      const minimal: Observation = {
        id: "minimal",
        text: "minimal pattern",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };
      await store.savePattern(minimal);

      const loaded = await store.getById("minimal");
      expect(loaded).not.toBeNull();
      expect(loaded!.category).toBeUndefined();
      expect(loaded!.tags).toBeUndefined();
      expect(loaded!.metadata).toBeUndefined();
    });

    it("should handle pattern with metadata", async () => {
      const withMeta = createTestPattern({
        id: "with-meta",
        metadata: { source: "tool-usage", toolName: "bash", frequency: 42 },
      });
      await store.savePattern(withMeta);

      const loaded = await store.getById("with-meta");
      expect(loaded!.metadata).toEqual({ source: "tool-usage", toolName: "bash", frequency: 42 });
    });

    it("should handle empty query options (return all non-expired)", async () => {
      await store.savePattern(createTestPattern({ id: "empty-opts" }));
      const results = await store.query({});
      expect(results).toHaveLength(1);
    });

    it("should handle empty store query", async () => {
      const results = await store.query({ category: "workflow" });
      expect(results).toHaveLength(0);
    });

    it("should handle large batch save", async () => {
      const patterns = Array.from({ length: 100 }, (_, i) =>
        createTestPattern({ id: `large-${i}`, count: i + 1 })
      );
      await store.savePatterns(patterns);
      expect(await store.count()).toBe(100);

      // Query with filter
      const highCount = await store.query({ minCount: 90 });
      expect(highCount).toHaveLength(11); // counts 90-100
    });

    it("should correctly count after mixed operations", async () => {
      await store.savePatterns([
        createTestPattern({ id: "mix-1" }),
        createTestPattern({ id: "mix-2" }),
        createTestPattern({ id: "mix-3" }),
      ]);
      expect(await store.count()).toBe(3);

      await store.delete("mix-2");
      expect(await store.count()).toBe(2);

      await store.savePattern(createTestPattern({ id: "mix-4" }));
      expect(await store.count()).toBe(3);

      await store.clear();
      expect(await store.count()).toBe(0);
    });
  });
});
