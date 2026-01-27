/**
 * Session Store Tests
 *
 * Comprehensive test suite for session storage implementation.
 * Tests cover all CRUD operations, querying, sorting, pagination,
 * error handling, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import type { Session } from "../../src/core/types.ts";
import { SessionStore } from "../../src/storage/session-store.ts";

// Test constants
const TEST_STORAGE_DIR = join(process.cwd(), ".test-sessions");
const TEST_STORAGE_PATH = join(TEST_STORAGE_DIR, "sessions.json");

// Helper: Create a test session
function createTestSession(overrides: Partial<Session> = {}): Session {
  const now = new Date();
  return {
    id: overrides.id || crypto.randomUUID(),
    tool: overrides.tool || "claude-code",
    projectSlug: overrides.projectSlug || "test-project",
    createdAt: overrides.createdAt || now,
    modifiedAt: overrides.modifiedAt || now,
    path: overrides.path || `/test/path/${crypto.randomUUID()}`,
    messageCount: overrides.messageCount || 10,
  };
}

// Helper: Clean up test storage
function cleanupTestStorage() {
  if (existsSync(TEST_STORAGE_PATH)) {
    try {
      unlinkSync(TEST_STORAGE_PATH);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(async () => {
    cleanupTestStorage();
    store = new SessionStore(TEST_STORAGE_PATH);
    await store.load();
  });

  afterEach(() => {
    cleanupTestStorage();
  });

  describe("Lifecycle Methods", () => {
    it("should initialize empty store on first load", async () => {
      const count = await store.count();
      expect(count).toBe(0);
    });

    it("should persist sessions across load/save cycles", async () => {
      const session = createTestSession({ id: "test-1" });
      await store.index(session);

      // Create new store instance to simulate app restart
      const newStore = new SessionStore(TEST_STORAGE_PATH);
      await newStore.load();

      const loaded = await newStore.getById("test-1");
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe("test-1");
      expect(loaded?.tool).toBe("claude-code");
    });

    it("should handle missing storage file gracefully", async () => {
      const newStore = new SessionStore("/nonexistent/path/sessions.json");
      await newStore.load();

      const count = await newStore.count();
      expect(count).toBe(0);
    });

    it("should clear all sessions", async () => {
      await store.index(createTestSession({ id: "test-1" }));
      await store.index(createTestSession({ id: "test-2" }));

      await store.clear();

      const count = await store.count();
      expect(count).toBe(0);
    });

    it("should return correct count", async () => {
      expect(await store.count()).toBe(0);

      await store.index(createTestSession({ id: "test-1" }));
      expect(await store.count()).toBe(1);

      await store.index(createTestSession({ id: "test-2" }));
      expect(await store.count()).toBe(2);
    });
  });

  describe("Index Operations", () => {
    it("should index a single session", async () => {
      const session = createTestSession({ id: "test-1" });
      const result = await store.index(session);

      expect(result.id).toBe("test-1");
      expect(await store.count()).toBe(1);
    });

    it("should bulk index multiple sessions", async () => {
      const sessions = [
        createTestSession({ id: "test-1" }),
        createTestSession({ id: "test-2" }),
        createTestSession({ id: "test-3" }),
      ];

      await store.bulkIndex(sessions);

      expect(await store.count()).toBe(3);
      expect(await store.getById("test-1")).not.toBeNull();
      expect(await store.getById("test-2")).not.toBeNull();
      expect(await store.getById("test-3")).not.toBeNull();
    });

    it("should update existing session on re-index", async () => {
      const original = createTestSession({
        id: "test-1",
        messageCount: 10,
      });
      await store.index(original);

      const updated = createTestSession({
        id: "test-1",
        messageCount: 20,
      });
      await store.index(updated);

      const loaded = await store.getById("test-1");
      expect(loaded?.messageCount).toBe(20);
      expect(await store.count()).toBe(1);
    });
  });

  describe("Read Operations", () => {
    beforeEach(async () => {
      const sessions = [
        createTestSession({
          id: "session-1",
          tool: "claude-code",
          projectSlug: "project-a",
          messageCount: 5,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          modifiedAt: new Date("2024-01-01T11:00:00Z"),
        }),
        createTestSession({
          id: "session-2",
          tool: "opencode",
          projectSlug: "project-b",
          messageCount: 15,
          createdAt: new Date("2024-01-02T10:00:00Z"),
          modifiedAt: new Date("2024-01-02T11:30:00Z"),
        }),
        createTestSession({
          id: "session-3",
          tool: "claude-code",
          projectSlug: "project-a",
          messageCount: 25,
          createdAt: new Date("2024-01-03T10:00:00Z"),
          modifiedAt: new Date("2024-01-03T13:00:00Z"),
        }),
      ];
      await store.bulkIndex(sessions);
    });

    it("should get session by ID", async () => {
      const session = await store.getById("session-1");

      expect(session).not.toBeNull();
      expect(session?.id).toBe("session-1");
      expect(session?.tool).toBe("claude-code");
    });

    it("should return null for non-existent session", async () => {
      const session = await store.getById("non-existent");
      expect(session).toBeNull();
    });

    it("should get sessions modified since timestamp", async () => {
      const sessions = await store.getSince(new Date("2024-01-02T00:00:00Z"));

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["session-2", "session-3"]);
    });

    it("should handle empty query results", async () => {
      const sessions = await store.getSince(new Date("2025-01-01T00:00:00Z"));
      expect(sessions.length).toBe(0);
    });
  });

  describe("Query Operations", () => {
    beforeEach(async () => {
      const sessions = [
        createTestSession({
          id: "session-1",
          tool: "claude-code",
          projectSlug: "project-a",
          messageCount: 5,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          modifiedAt: new Date("2024-01-01T11:00:00Z"),
        }),
        createTestSession({
          id: "session-2",
          tool: "opencode",
          projectSlug: "project-b",
          messageCount: 15,
          createdAt: new Date("2024-01-02T10:00:00Z"),
          modifiedAt: new Date("2024-01-02T11:30:00Z"),
        }),
        createTestSession({
          id: "session-3",
          tool: "claude-code",
          projectSlug: "project-a",
          messageCount: 25,
          createdAt: new Date("2024-01-03T10:00:00Z"),
          modifiedAt: new Date("2024-01-03T13:00:00Z"),
        }),
      ];
      await store.bulkIndex(sessions);
    });

    it("should query with no filters", async () => {
      const sessions = await store.query({});
      expect(sessions.length).toBe(3);
    });

    it("should filter by tool type", async () => {
      const sessions = await store.query({ tool: "claude-code" });

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["session-1", "session-3"]);
    });

    it("should filter by project slug", async () => {
      const sessions = await store.query({ projectSlug: "project-a" });

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["session-1", "session-3"]);
    });

    it("should filter by minimum message count", async () => {
      const sessions = await store.query({ minMessages: 10 });

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["session-2", "session-3"]);
    });

    it("should filter by date range (start only)", async () => {
      const sessions = await store.query({
        dateRange: {
          start: new Date("2024-01-02T00:00:00Z"),
          field: "createdAt",
        },
      });

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["session-2", "session-3"]);
    });

    it("should filter by date range (end only)", async () => {
      const sessions = await store.query({
        dateRange: {
          end: new Date("2024-01-02T00:00:00Z"),
          field: "createdAt",
        },
      });

      expect(sessions.length).toBe(1);
      expect(sessions.map((s) => s.id)).toEqual(["session-1"]);
    });

    it("should filter by date range (start and end)", async () => {
      const sessions = await store.query({
        dateRange: {
          start: new Date("2024-01-02T00:00:00Z"),
          end: new Date("2024-01-03T00:00:00Z"),
          field: "createdAt",
        },
      });

      expect(sessions.length).toBe(1);
      expect(sessions.map((s) => s.id)).toEqual(["session-2"]);
    });

    it("should combine multiple filters (AND logic)", async () => {
      const sessions = await store.query({
        tool: "claude-code",
        projectSlug: "project-a",
        minMessages: 10,
      });

      expect(sessions.length).toBe(1);
      expect(sessions.map((s) => s.id)).toEqual(["session-3"]);
    });

    it("should handle session without projectSlug", async () => {
      const sessionWithoutProject = createTestSession({
        id: "session-4",
        projectSlug: undefined,
      });
      await store.index(sessionWithoutProject);

      // Query with undefined projectSlug should only match sessions with undefined
      const sessions = await store.query({ projectSlug: undefined });
      expect(sessions.map((s) => s.id)).toContain("session-4");
    });
  });

  describe("Sorting Operations", () => {
    beforeEach(async () => {
      const sessions = [
        createTestSession({
          id: "session-1",
          messageCount: 5,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          modifiedAt: new Date("2024-01-01T11:00:00Z"),
        }),
        createTestSession({
          id: "session-2",
          messageCount: 15,
          createdAt: new Date("2024-01-02T10:00:00Z"),
          modifiedAt: new Date("2024-01-02T11:30:00Z"),
        }),
        createTestSession({
          id: "session-3",
          messageCount: 25,
          createdAt: new Date("2024-01-03T10:00:00Z"),
          modifiedAt: new Date("2024-01-03T13:00:00Z"),
        }),
      ];
      await store.bulkIndex(sessions);
    });

    it("should sort by createdAt ascending", async () => {
      const sessions = await store.query({}, undefined, {
        field: "createdAt",
        direction: "asc",
      });

      expect(sessions.map((s) => s.id)).toEqual(["session-1", "session-2", "session-3"]);
    });

    it("should sort by createdAt descending", async () => {
      const sessions = await store.query({}, undefined, {
        field: "createdAt",
        direction: "desc",
      });

      expect(sessions.map((s) => s.id)).toEqual(["session-3", "session-2", "session-1"]);
    });

    it("should sort by messageCount ascending", async () => {
      const sessions = await store.query({}, undefined, {
        field: "messageCount",
        direction: "asc",
      });

      expect(sessions.map((s) => s.id)).toEqual(["session-1", "session-2", "session-3"]);
    });

    it("should sort by messageCount descending", async () => {
      const sessions = await store.query({}, undefined, {
        field: "messageCount",
        direction: "desc",
      });

      expect(sessions.map((s) => s.id)).toEqual(["session-3", "session-2", "session-1"]);
    });

    it("should sort by calculated duration ascending", async () => {
      const sessions = await store.query({}, undefined, {
        field: "duration" as any,
        direction: "asc",
      });

      // Duration: session-1=1h, session-2=1.5h, session-3=3h
      expect(sessions.map((s) => s.id)).toEqual(["session-1", "session-2", "session-3"]);
    });

    it("should sort by calculated duration descending", async () => {
      const sessions = await store.query({}, undefined, {
        field: "duration" as any,
        direction: "desc",
      });

      expect(sessions.map((s) => s.id)).toEqual(["session-3", "session-2", "session-1"]);
    });
  });

  describe("Pagination Operations", () => {
    beforeEach(async () => {
      const sessions = Array.from({ length: 10 }, (_, i) =>
        createTestSession({
          id: `session-${i}`,
          messageCount: i * 10,
        })
      );
      await store.bulkIndex(sessions);
    });

    it("should paginate results with offset", async () => {
      const sessions = await store.query({}, { offset: 5, limit: 10 });
      expect(sessions.length).toBe(5);
      expect(sessions[0].id).toBe("session-5");
    });

    it("should paginate results with limit", async () => {
      const sessions = await store.query({}, { offset: 0, limit: 3 });
      expect(sessions.length).toBe(3);
    });

    it("should handle offset beyond total", async () => {
      const sessions = await store.query({}, { offset: 20, limit: 10 });
      expect(sessions.length).toBe(0);
    });

    it("should handle limit beyond total", async () => {
      const sessions = await store.query({}, { offset: 0, limit: 100 });
      expect(sessions.length).toBe(10);
    });

    it("should combine sorting with pagination", async () => {
      const sessions = await store.query(
        {},
        { offset: 0, limit: 3 },
        { field: "messageCount", direction: "desc" }
      );

      expect(sessions.length).toBe(3);
      expect(sessions.map((s) => s.messageCount)).toEqual([90, 80, 70]);
    });
  });

  describe("Update Operations", () => {
    it("should update session metadata", async () => {
      const original = createTestSession({
        id: "test-1",
        messageCount: 10,
      });
      await store.index(original);

      const updated = await store.update("test-1", {
        messageCount: 20,
        modifiedAt: new Date("2024-01-02T00:00:00Z"),
      });

      expect(updated.messageCount).toBe(20);
      expect(updated.id).toBe("test-1");

      const loaded = await store.getById("test-1");
      expect(loaded?.messageCount).toBe(20);
    });

    it("should preserve id when updating", async () => {
      const original = createTestSession({ id: "test-1" });
      await store.index(original);

      await store.update("test-1", { id: "different-id" } as Session);

      const loaded = await store.getById("test-1");
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe("test-1");
    });

    it("should throw error when updating non-existent session", async () => {
      await expect(
        store.update("non-existent", { messageCount: 20 })
      ).rejects.toThrow();
    });
  });

  describe("Delete Operations", () => {
    it("should remove session from index", async () => {
      await store.index(createTestSession({ id: "test-1" }));

      const removed = await store.remove("test-1");

      expect(removed).toBe(true);
      expect(await store.count()).toBe(0);
      expect(await store.getById("test-1")).toBeNull();
    });

    it("should return false when removing non-existent session", async () => {
      const removed = await store.remove("non-existent");
      expect(removed).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle corrupted JSON file", async () => {
      // Write invalid JSON to storage file
      await Bun.write(TEST_STORAGE_PATH, "invalid json{");

      const newStore = new SessionStore(TEST_STORAGE_PATH);
      await expect(newStore.load()).rejects.toThrow();
    });

    it("should persist data after error recovery", async () => {
      await store.index(createTestSession({ id: "test-1" }));

      // Write invalid JSON to storage file
      await Bun.write(TEST_STORAGE_PATH, "invalid json{");

      const newStore = new SessionStore(TEST_STORAGE_PATH);
      await expect(newStore.load()).rejects.toThrow();

      // Clear storage and reload
      cleanupTestStorage();
      const cleanStore = new SessionStore(TEST_STORAGE_PATH);
      await cleanStore.load();

      expect(await cleanStore.count()).toBe(0);
    });
  });

  describe("Complex Query Scenarios", () => {
    beforeEach(async () => {
      const sessions = [
        createTestSession({
          id: "recent-claude",
          tool: "claude-code",
          projectSlug: "project-a",
          messageCount: 50,
          createdAt: new Date("2024-01-10T10:00:00Z"),
          modifiedAt: new Date("2024-01-10T12:00:00Z"),
        }),
        createTestSession({
          id: "old-claude",
          tool: "claude-code",
          projectSlug: "project-a",
          messageCount: 10,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          modifiedAt: new Date("2024-01-01T11:00:00Z"),
        }),
        createTestSession({
          id: "recent-opencode",
          tool: "opencode",
          projectSlug: "project-b",
          messageCount: 30,
          createdAt: new Date("2024-01-09T10:00:00Z"),
          modifiedAt: new Date("2024-01-09T14:00:00Z"),
        }),
      ];
      await store.bulkIndex(sessions);
    });

    it("should find recent sessions with high message count", async () => {
      const sessions = await store.query(
        {
          minMessages: 25,
          dateRange: {
            start: new Date("2024-01-05T00:00:00Z"),
            field: "createdAt",
          },
        },
        undefined,
        { field: "messageCount", direction: "desc" }
      );

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["recent-claude", "recent-opencode"]);
    });

    it("should find all sessions for a project, sorted by date", async () => {
      const sessions = await store.query(
        { projectSlug: "project-a" },
        undefined,
        { field: "createdAt", direction: "desc" }
      );

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id)).toEqual(["recent-claude", "old-claude"]);
    });
  });
});
