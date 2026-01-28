/**
 * Tests for TUI entry point (index.ts) logic.
 *
 * Why these tests matter:
 * - The entry point is the bridge between CLI and TUI subprocess
 * - parseInput is the first thing executed — malformed JSON here crashes
 *   the entire review session before anything renders
 * - ReviewResults serialization must round-trip correctly for the CLI
 *   to persist user decisions to ObservationStore
 */

import { describe, it, expect } from "bun:test";
import type { Observation } from "../../src/core/types.ts";
import type { ReviewResults } from "../../src/tui/index.ts";

// Replicate parseInput logic for unit testing (without process.argv manipulation)
function parseObservationsFromString(input: string): Observation[] {
  const parsed = JSON.parse(input);
  if (!Array.isArray(parsed)) {
    throw new Error("Input must be a JSON array of observations");
  }
  return parsed.map((obs: Record<string, unknown>) => ({
    ...obs,
    firstSeen: obs.firstSeen ? new Date(obs.firstSeen as string) : new Date(),
    lastSeen: obs.lastSeen ? new Date(obs.lastSeen as string) : new Date(),
  })) as Observation[];
}

function serializeResults(results: ReviewResults): string {
  return JSON.stringify(results, null, 2);
}

function deserializeResults(json: string): ReviewResults {
  return JSON.parse(json) as ReviewResults;
}

describe("TUI Entry Point", () => {
  describe("parseObservationsFromString", () => {
    it("parses valid observation JSON", () => {
      const input = JSON.stringify([
        {
          id: "obs-1",
          text: "Test observation",
          count: 3,
          status: "pending",
          sourceSessionIds: ["session-001"],
          firstSeen: "2025-01-15T10:00:00Z",
          lastSeen: "2025-01-20T14:00:00Z",
        },
      ]);
      const result = parseObservationsFromString(input);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("obs-1");
      expect(result[0]!.text).toBe("Test observation");
    });

    it("deserializes date strings to Date objects", () => {
      const input = JSON.stringify([
        {
          id: "obs-1",
          text: "Test",
          count: 1,
          status: "pending",
          sourceSessionIds: [],
          firstSeen: "2025-06-15T10:30:00Z",
          lastSeen: "2025-06-20T14:00:00Z",
        },
      ]);
      const result = parseObservationsFromString(input);
      expect(result[0]!.firstSeen).toBeInstanceOf(Date);
      expect(result[0]!.lastSeen).toBeInstanceOf(Date);
    });

    it("handles missing dates by defaulting to now", () => {
      const input = JSON.stringify([
        {
          id: "obs-1",
          text: "No dates",
          count: 1,
          status: "pending",
          sourceSessionIds: [],
        },
      ]);
      const before = new Date();
      const result = parseObservationsFromString(input);
      const after = new Date();
      expect(result[0]!.firstSeen).toBeInstanceOf(Date);
      expect(result[0]!.firstSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result[0]!.firstSeen.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("parses empty array", () => {
      const result = parseObservationsFromString("[]");
      expect(result).toHaveLength(0);
    });

    it("parses multiple observations", () => {
      const input = JSON.stringify([
        { id: "obs-1", text: "First", count: 1, status: "pending", sourceSessionIds: [], firstSeen: "2025-01-01T00:00:00Z", lastSeen: "2025-01-01T00:00:00Z" },
        { id: "obs-2", text: "Second", count: 2, status: "pending", sourceSessionIds: ["s1"], firstSeen: "2025-01-02T00:00:00Z", lastSeen: "2025-01-02T00:00:00Z" },
        { id: "obs-3", text: "Third", count: 3, status: "pending", sourceSessionIds: ["s1", "s2"], firstSeen: "2025-01-03T00:00:00Z", lastSeen: "2025-01-03T00:00:00Z" },
      ]);
      const result = parseObservationsFromString(input);
      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe("obs-1");
      expect(result[1]!.id).toBe("obs-2");
      expect(result[2]!.id).toBe("obs-3");
    });

    it("throws on invalid JSON", () => {
      expect(() => parseObservationsFromString("not json")).toThrow();
    });

    it("throws on non-array JSON", () => {
      expect(() => parseObservationsFromString('{"id": "obs-1"}')).toThrow(
        "Input must be a JSON array"
      );
    });

    it("preserves all observation fields through parse", () => {
      const input = JSON.stringify([
        {
          id: "full-obs",
          text: "Full observation with all fields",
          count: 42,
          status: "pending",
          sourceSessionIds: ["s1", "s2", "s3"],
          category: "preference",
          tags: ["typescript", "strict-mode"],
          firstSeen: "2025-03-15T08:00:00Z",
          lastSeen: "2025-03-20T16:30:00Z",
          metadata: { source: "analyzer" },
        },
      ]);
      const result = parseObservationsFromString(input);
      expect(result[0]!.id).toBe("full-obs");
      expect(result[0]!.count).toBe(42);
      expect(result[0]!.sourceSessionIds).toHaveLength(3);
      expect(result[0]!.category).toBe("preference");
      expect(result[0]!.tags).toContain("typescript");
    });
  });

  describe("ReviewResults serialization", () => {
    it("serializes results to valid JSON", () => {
      const results: ReviewResults = {
        approvedObservations: ["obs-1", "obs-2"],
        deniedObservations: ["obs-3"],
        skippedObservations: ["obs-4"],
      };
      const json = serializeResults(results);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("round-trips results through serialization", () => {
      const original: ReviewResults = {
        approvedObservations: ["obs-1", "obs-2"],
        deniedObservations: ["obs-3"],
        skippedObservations: [],
      };
      const json = serializeResults(original);
      const restored = deserializeResults(json);
      expect(restored).toEqual(original);
    });

    it("handles empty results", () => {
      const results: ReviewResults = {
        approvedObservations: [],
        deniedObservations: [],
        skippedObservations: [],
      };
      const json = serializeResults(results);
      const restored = deserializeResults(json);
      expect(restored.approvedObservations).toHaveLength(0);
      expect(restored.deniedObservations).toHaveLength(0);
      expect(restored.skippedObservations).toHaveLength(0);
    });

    it("preserves order of observation IDs", () => {
      const results: ReviewResults = {
        approvedObservations: ["obs-3", "obs-1", "obs-2"],
        deniedObservations: [],
        skippedObservations: [],
      };
      const restored = deserializeResults(serializeResults(results));
      expect(restored.approvedObservations).toEqual(["obs-3", "obs-1", "obs-2"]);
    });
  });
});
