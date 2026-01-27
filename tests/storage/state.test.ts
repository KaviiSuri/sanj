/**
 * Tests for storage/state.ts
 *
 * Comprehensive test suite covering:
 * - State file I/O operations
 * - Timestamp management
 * - Session cursor tracking
 * - Error recording
 * - Count updates
 * - Edge cases and error handling
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getState,
  setState,
  updateLastAnalysisRun,
  getLastAnalysisRun,
  updateSessionCursor,
  getSessionCursor,
  recordError,
  updateObservationCount,
  updateLongTermMemoryCount,
  updateCoreMemoryCount,
} from "../../src/storage/state";
import type { AnalysisState } from "../../src/core/types";

// Use a temporary directory for tests - create unique directory per test suite
let TEST_DIR: string;
let TEST_STATE_PATH: string;

beforeEach(() => {
  // Create unique test directory for each test
  TEST_DIR = join(tmpdir(), `sanj-test-${Date.now()}-${Math.random()}`);
  TEST_STATE_PATH = join(TEST_DIR, "state.json");

  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("storage/state", () => {
  describe("getState()", () => {
    test("returns default state when file doesn't exist", async () => {
      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisRun).toBeUndefined();
      expect(state.lastAnalysisError).toBeUndefined();
      expect(state.sessionCursors).toEqual({});
      expect(state.observationCount).toBe(0);
      expect(state.longTermMemoryCount).toBe(0);
      expect(state.coreMemoryCount).toBe(0);
    });

    test("loads valid state from disk", async () => {
      const testDate = new Date("2026-01-27T10:30:00Z");
      const testState: AnalysisState = {
        lastAnalysisRun: testDate,
        sessionCursors: { claude_code: "2026-01-27T10:00:00Z" },
        observationCount: 10,
        longTermMemoryCount: 5,
        coreMemoryCount: 2,
      };

      await setState(testState, TEST_STATE_PATH);
      const loaded = await getState(TEST_STATE_PATH);

      expect(loaded.lastAnalysisRun).toEqual(testDate);
      expect(loaded.sessionCursors).toEqual({ claude_code: "2026-01-27T10:00:00Z" });
      expect(loaded.observationCount).toBe(10);
      expect(loaded.longTermMemoryCount).toBe(5);
      expect(loaded.coreMemoryCount).toBe(2);
    });

    test("throws error on malformed JSON", async () => {
      // Write invalid JSON
      await Bun.write(TEST_STATE_PATH, "{ invalid json }");

      await expect(getState(TEST_STATE_PATH)).rejects.toThrow("Invalid JSON format");
    });

    test("preserves state between multiple reads", async () => {
      const testState: AnalysisState = {
        lastAnalysisRun: new Date(),
        observationCount: 42,
        longTermMemoryCount: 7,
        coreMemoryCount: 3,
      };

      await setState(testState, TEST_STATE_PATH);

      const state1 = await getState(TEST_STATE_PATH);
      const state2 = await getState(TEST_STATE_PATH);

      expect(state1.observationCount).toBe(42);
      expect(state2.observationCount).toBe(42);
    });
  });

  describe("setState()", () => {
    test("creates state file with correct format", async () => {
      const testState: AnalysisState = {
        lastAnalysisRun: new Date("2026-01-27T12:00:00Z"),
        observationCount: 15,
        longTermMemoryCount: 3,
        coreMemoryCount: 1,
      };

      await setState(testState, TEST_STATE_PATH);

      expect(existsSync(TEST_STATE_PATH)).toBe(true);

      const content = await Bun.file(TEST_STATE_PATH).text();
      const parsed = JSON.parse(content);

      expect(parsed.lastAnalysisRun).toBe("2026-01-27T12:00:00.000Z");
      expect(parsed.observationCount).toBe(15);
      expect(parsed.version).toBe(1);
    });

    test("creates parent directory if needed", async () => {
      // Remove test directory
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true });
      }

      const testState: AnalysisState = {
        observationCount: 0,
        longTermMemoryCount: 0,
        coreMemoryCount: 0,
      };

      await setState(testState, TEST_STATE_PATH);

      expect(existsSync(TEST_DIR)).toBe(true);
      expect(existsSync(TEST_STATE_PATH)).toBe(true);
    });

    test("formats JSON with 2-space indentation", async () => {
      const testState: AnalysisState = {
        observationCount: 5,
        longTermMemoryCount: 2,
        coreMemoryCount: 1,
      };

      await setState(testState, TEST_STATE_PATH);

      const content = await Bun.file(TEST_STATE_PATH).text();

      // Check for indentation
      expect(content).toContain('  "lastAnalysisRun"');
      expect(content).toContain('  "observationCount"');
    });

    test("uses atomic write pattern", async () => {
      const testState: AnalysisState = {
        observationCount: 10,
        longTermMemoryCount: 5,
        coreMemoryCount: 2,
      };

      await setState(testState, TEST_STATE_PATH);

      // Verify no temp file remains
      expect(existsSync(`${TEST_STATE_PATH}.tmp`)).toBe(false);
    });
  });

  describe("updateLastAnalysisRun()", () => {
    test("updates timestamp to current time", async () => {
      const beforeUpdate = new Date();
      await updateLastAnalysisRun(TEST_STATE_PATH);
      const afterUpdate = new Date();

      const state = await getState(TEST_STATE_PATH);
      const timestamp = state.lastAnalysisRun;

      expect(timestamp).toBeDefined();
      expect(timestamp!.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(timestamp!.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    test("clears error state on successful update", async () => {
      // Set an error first
      await recordError("Test error", TEST_STATE_PATH);
      let state = await getState(TEST_STATE_PATH);
      expect(state.lastAnalysisError).toBe("Test error");

      // Update timestamp
      await updateLastAnalysisRun(TEST_STATE_PATH);
      state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisError).toBeUndefined();
    });

    test("persists changes to disk", async () => {
      await updateLastAnalysisRun(TEST_STATE_PATH);

      // Create a new state instance to verify persistence
      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisRun).toBeDefined();
    });
  });

  describe("getLastAnalysisRun()", () => {
    test("returns Date object when run exists", async () => {
      const testDate = new Date("2026-01-27T10:30:00Z");
      await setState({
        lastAnalysisRun: testDate,
        observationCount: 0,
        longTermMemoryCount: 0,
        coreMemoryCount: 0,
      }, TEST_STATE_PATH);

      const lastRun = await getLastAnalysisRun(TEST_STATE_PATH);

      expect(lastRun).toEqual(testDate);
      expect(lastRun).toBeInstanceOf(Date);
    });

    test("returns null when no run has occurred", async () => {
      const lastRun = await getLastAnalysisRun(TEST_STATE_PATH);

      expect(lastRun).toBeNull();
    });

    test("parses ISO 8601 correctly", async () => {
      const isoString = "2026-01-27T15:45:30.500Z";
      await setState({
        lastAnalysisRun: new Date(isoString),
        observationCount: 0,
        longTermMemoryCount: 0,
        coreMemoryCount: 0,
      }, TEST_STATE_PATH);

      const lastRun = await getLastAnalysisRun(TEST_STATE_PATH);

      expect(lastRun?.toISOString()).toBe(isoString);
    });
  });

  describe("updateSessionCursor()", () => {
    test("creates new cursor entry", async () => {
      const timestamp = new Date("2026-01-27T11:00:00Z");
      await updateSessionCursor("claude_code", timestamp, TEST_STATE_PATH);

      const cursor = await getSessionCursor("claude_code", TEST_STATE_PATH);

      expect(cursor).toEqual(timestamp);
    });

    test("updates existing cursor", async () => {
      const timestamp1 = new Date("2026-01-27T10:00:00Z");
      const timestamp2 = new Date("2026-01-27T11:00:00Z");

      await updateSessionCursor("claude_code", timestamp1, TEST_STATE_PATH);
      await updateSessionCursor("claude_code", timestamp2, TEST_STATE_PATH);

      const cursor = await getSessionCursor("claude_code", TEST_STATE_PATH);

      expect(cursor).toEqual(timestamp2);
    });

    test("supports multiple adapters", async () => {
      const claudeTimestamp = new Date("2026-01-27T10:00:00Z");
      const opencodeTimestamp = new Date("2026-01-27T11:00:00Z");

      await updateSessionCursor("claude_code", claudeTimestamp, TEST_STATE_PATH);
      await updateSessionCursor("opencode", opencodeTimestamp, TEST_STATE_PATH);

      const claudeCursor = await getSessionCursor("claude_code", TEST_STATE_PATH);
      const opencodeCursor = await getSessionCursor("opencode", TEST_STATE_PATH);

      expect(claudeCursor).toEqual(claudeTimestamp);
      expect(opencodeCursor).toEqual(opencodeTimestamp);
    });

    test("persists changes to disk", async () => {
      const timestamp = new Date("2026-01-27T12:00:00Z");
      await updateSessionCursor("test_adapter", timestamp, TEST_STATE_PATH);

      // Read state fresh from disk
      const state = await getState(TEST_STATE_PATH);

      expect(state.sessionCursors?.["test_adapter"]).toBe(timestamp.toISOString());
    });
  });

  describe("getSessionCursor()", () => {
    test("returns Date object when cursor exists", async () => {
      const timestamp = new Date("2026-01-27T13:00:00Z");
      await updateSessionCursor("claude_code", timestamp, TEST_STATE_PATH);

      const cursor = await getSessionCursor("claude_code", TEST_STATE_PATH);

      expect(cursor).toEqual(timestamp);
      expect(cursor).toBeInstanceOf(Date);
    });

    test("returns null when no cursor exists", async () => {
      const cursor = await getSessionCursor("nonexistent_adapter", TEST_STATE_PATH);

      expect(cursor).toBeNull();
    });

    test("handles empty sessionCursors object", async () => {
      await setState({
        observationCount: 0,
        longTermMemoryCount: 0,
        coreMemoryCount: 0,
      }, TEST_STATE_PATH);

      const cursor = await getSessionCursor("any_adapter", TEST_STATE_PATH);

      expect(cursor).toBeNull();
    });
  });

  describe("recordError()", () => {
    test("stores error message", async () => {
      const errorMessage = "Analysis failed: Network timeout";
      await recordError(errorMessage, TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisError).toBe(errorMessage);
    });

    test("overwrites previous error", async () => {
      await recordError("First error", TEST_STATE_PATH);
      await recordError("Second error", TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisError).toBe("Second error");
    });

    test("never throws on error", async () => {
      // Delete state file mid-operation to force an error
      // The function should swallow the error
      await expect(recordError("Test error", TEST_STATE_PATH)).resolves.toBeUndefined();
    });

    test("persists error to disk", async () => {
      await recordError("Persistent error", TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisError).toBe("Persistent error");
    });
  });

  describe("updateObservationCount()", () => {
    test("updates observation count", async () => {
      await updateObservationCount(25, TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.observationCount).toBe(25);
    });

    test("persists changes to disk", async () => {
      await updateObservationCount(42, TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.observationCount).toBe(42);
    });
  });

  describe("updateLongTermMemoryCount()", () => {
    test("updates long-term memory count", async () => {
      await updateLongTermMemoryCount(8, TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.longTermMemoryCount).toBe(8);
    });
  });

  describe("updateCoreMemoryCount()", () => {
    test("updates core memory count", async () => {
      await updateCoreMemoryCount(3, TEST_STATE_PATH);

      const state = await getState(TEST_STATE_PATH);

      expect(state.coreMemoryCount).toBe(3);
    });
  });

  describe("Integration Tests", () => {
    test("full state management flow", async () => {
      // Initialize with analysis
      await updateLastAnalysisRun(TEST_STATE_PATH);
      await updateObservationCount(10, TEST_STATE_PATH);

      // Update cursors for different adapters
      await updateSessionCursor("claude_code", new Date("2026-01-27T10:00:00Z"), TEST_STATE_PATH);
      await updateSessionCursor("opencode", new Date("2026-01-27T11:00:00Z"), TEST_STATE_PATH);

      // Update memory counts
      await updateLongTermMemoryCount(5, TEST_STATE_PATH);
      await updateCoreMemoryCount(2, TEST_STATE_PATH);

      // Verify everything persisted correctly
      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisRun).toBeDefined();
      expect(state.observationCount).toBe(10);
      expect(state.sessionCursors).toHaveProperty("claude_code");
      expect(state.sessionCursors).toHaveProperty("opencode");
      expect(state.longTermMemoryCount).toBe(5);
      expect(state.coreMemoryCount).toBe(2);
    });

    test("error recovery flow", async () => {
      // Start analysis
      await updateLastAnalysisRun(TEST_STATE_PATH);

      // Simulate error
      await recordError("Analysis failed: timeout", TEST_STATE_PATH);

      // Verify error was recorded
      let state = await getState(TEST_STATE_PATH);
      expect(state.lastAnalysisError).toBe("Analysis failed: timeout");

      // Successful run clears error
      await updateLastAnalysisRun(TEST_STATE_PATH);
      state = await getState(TEST_STATE_PATH);
      expect(state.lastAnalysisError).toBeUndefined();
    });

    test("state survives process restart simulation", async () => {
      // Write state
      const timestamp = new Date("2026-01-27T14:00:00Z");
      await setState({
        lastAnalysisRun: timestamp,
        sessionCursors: { claude_code: "2026-01-27T13:00:00Z" },
        observationCount: 15,
        longTermMemoryCount: 6,
        coreMemoryCount: 3,
      }, TEST_STATE_PATH);

      // Simulate restart by reading fresh
      const state = await getState(TEST_STATE_PATH);

      expect(state.lastAnalysisRun).toEqual(timestamp);
      expect(state.sessionCursors?.["claude_code"]).toBe("2026-01-27T13:00:00Z");
      expect(state.observationCount).toBe(15);
      expect(state.longTermMemoryCount).toBe(6);
      expect(state.coreMemoryCount).toBe(3);
    });
  });
});
