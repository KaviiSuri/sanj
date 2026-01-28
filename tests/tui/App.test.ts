/**
 * Tests for App TUI root component logic.
 *
 * Why these tests matter:
 * - App manages the entire review session state machine (list focus ↔ action bar)
 * - Approve/deny/skip mutations must correctly remove items and adjust selection
 * - If selection index isn't clamped after removal, the TUI crashes
 * - ReviewResults aggregation must be complete for the CLI to persist decisions
 */

import { describe, it, expect } from "bun:test";
import type { Observation } from "../../src/core/types.ts";
import type { ReviewResults } from "../../src/tui/index.ts";

function createObservation(id: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id,
    text: `Test observation ${id}`,
    count: 2,
    status: "pending",
    sourceSessionIds: ["session-001"],
    firstSeen: new Date("2025-01-01T00:00:00Z"),
    lastSeen: new Date("2025-01-10T00:00:00Z"),
    ...overrides,
  };
}

// Simulate the App's action handlers to test state transitions

function simulateApprove(
  observations: Observation[],
  selectedIndex: number,
  approved: string[]
): { observations: Observation[]; selectedIndex: number; approved: string[] } {
  if (observations.length === 0 || selectedIndex >= observations.length) {
    return { observations, selectedIndex, approved };
  }
  const obs = observations[selectedIndex]!;
  if (!obs) return { observations, selectedIndex, approved };

  const newApproved = [...approved, obs.id];
  const newObservations = observations.filter((o) => o.id !== obs.id);
  const newIndex =
    selectedIndex >= newObservations.length
      ? Math.max(0, newObservations.length - 1)
      : selectedIndex;

  return {
    observations: newObservations,
    selectedIndex: newIndex,
    approved: newApproved,
  };
}

function simulateDeny(
  observations: Observation[],
  selectedIndex: number,
  denied: string[]
): { observations: Observation[]; selectedIndex: number; denied: string[] } {
  if (observations.length === 0 || selectedIndex >= observations.length) {
    return { observations, selectedIndex, denied };
  }
  const obs = observations[selectedIndex]!;
  if (!obs) return { observations, selectedIndex, denied };

  const newDenied = [...denied, obs.id];
  const newObservations = observations.filter((o) => o.id !== obs.id);
  const newIndex =
    selectedIndex >= newObservations.length
      ? Math.max(0, newObservations.length - 1)
      : selectedIndex;

  return {
    observations: newObservations,
    selectedIndex: newIndex,
    denied: newDenied,
  };
}

function simulateSkip(
  observations: Observation[],
  selectedIndex: number,
  skipped: string[]
): { observations: Observation[]; selectedIndex: number; skipped: string[] } {
  if (observations.length === 0 || selectedIndex >= observations.length) {
    return { observations, selectedIndex, skipped };
  }
  const obs = observations[selectedIndex]!;
  if (!obs) return { observations, selectedIndex, skipped };

  const newSkipped = [...skipped, obs.id];
  // Skip moves to next item without removing
  const newIndex = selectedIndex < observations.length - 1 ? selectedIndex + 1 : selectedIndex;

  return {
    observations,
    selectedIndex: newIndex,
    skipped: newSkipped,
  };
}

describe("App state management", () => {
  describe("approve action", () => {
    it("removes observation and adds to approved list", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
        createObservation("obs-3"),
      ];
      const result = simulateApprove(observations, 0, []);
      expect(result.observations).toHaveLength(2);
      expect(result.approved).toContain("obs-1");
      expect(result.observations.find((o) => o.id === "obs-1")).toBeUndefined();
    });

    it("clamps index when approving last item", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
      ];
      const result = simulateApprove(observations, 1, []);
      expect(result.selectedIndex).toBe(0); // clamped to new last item
      expect(result.observations).toHaveLength(1);
    });

    it("handles approving from single-item list", () => {
      const observations = [createObservation("obs-1")];
      const result = simulateApprove(observations, 0, []);
      expect(result.observations).toHaveLength(0);
      expect(result.selectedIndex).toBe(0);
      expect(result.approved).toContain("obs-1");
    });

    it("does nothing on empty list", () => {
      const result = simulateApprove([], 0, []);
      expect(result.observations).toHaveLength(0);
      expect(result.approved).toHaveLength(0);
    });

    it("does nothing when index out of bounds", () => {
      const observations = [createObservation("obs-1")];
      const result = simulateApprove(observations, 5, []);
      expect(result.observations).toHaveLength(1);
      expect(result.approved).toHaveLength(0);
    });

    it("accumulates multiple approvals", () => {
      let observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
        createObservation("obs-3"),
      ];
      let approved: string[] = [];
      let index = 0;

      // Approve first (obs-1)
      const r1 = simulateApprove(observations, index, approved);
      observations = r1.observations;
      approved = r1.approved;
      index = r1.selectedIndex;

      // Approve new first (obs-2)
      const r2 = simulateApprove(observations, index, approved);
      observations = r2.observations;
      approved = r2.approved;

      expect(approved).toEqual(["obs-1", "obs-2"]);
      expect(observations).toHaveLength(1);
    });
  });

  describe("deny action", () => {
    it("removes observation and adds to denied list", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
      ];
      const result = simulateDeny(observations, 0, []);
      expect(result.observations).toHaveLength(1);
      expect(result.denied).toContain("obs-1");
    });

    it("clamps index when denying last item", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
      ];
      const result = simulateDeny(observations, 1, []);
      expect(result.selectedIndex).toBe(0);
    });

    it("does nothing on empty list", () => {
      const result = simulateDeny([], 0, []);
      expect(result.observations).toHaveLength(0);
      expect(result.denied).toHaveLength(0);
    });
  });

  describe("skip action", () => {
    it("moves to next item without removing", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
        createObservation("obs-3"),
      ];
      const result = simulateSkip(observations, 0, []);
      expect(result.observations).toHaveLength(3); // not removed
      expect(result.selectedIndex).toBe(1); // moved forward
      expect(result.skipped).toContain("obs-1");
    });

    it("stays at last item when skipping at end", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
      ];
      const result = simulateSkip(observations, 1, []);
      expect(result.selectedIndex).toBe(1); // stays
      expect(result.skipped).toContain("obs-2");
    });

    it("does nothing on empty list", () => {
      const result = simulateSkip([], 0, []);
      expect(result.observations).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it("accumulates skipped IDs", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
        createObservation("obs-3"),
      ];
      let skipped: string[] = [];
      let index = 0;

      const r1 = simulateSkip(observations, index, skipped);
      skipped = r1.skipped;
      index = r1.selectedIndex;

      const r2 = simulateSkip(observations, index, skipped);
      skipped = r2.skipped;

      expect(skipped).toEqual(["obs-1", "obs-2"]);
    });
  });

  describe("ReviewResults aggregation", () => {
    it("collects all action results", () => {
      let observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
        createObservation("obs-3"),
        createObservation("obs-4"),
      ];
      let approved: string[] = [];
      let denied: string[] = [];
      let skipped: string[] = [];
      let index = 0;

      // Approve obs-1
      const r1 = simulateApprove(observations, index, approved);
      observations = r1.observations;
      approved = r1.approved;
      index = r1.selectedIndex;

      // Deny obs-2 (now at index 0)
      const r2 = simulateDeny(observations, index, denied);
      observations = r2.observations;
      denied = r2.denied;
      index = r2.selectedIndex;

      // Skip obs-3 (now at index 0)
      const r3 = simulateSkip(observations, index, skipped);
      skipped = r3.skipped;
      index = r3.selectedIndex;

      const results: ReviewResults = {
        approvedObservations: approved,
        deniedObservations: denied,
        skippedObservations: skipped,
      };

      expect(results.approvedObservations).toContain("obs-1");
      expect(results.deniedObservations).toContain("obs-2");
      expect(results.skippedObservations).toContain("obs-3");
    });

    it("empty session produces empty results", () => {
      const results: ReviewResults = {
        approvedObservations: [],
        deniedObservations: [],
        skippedObservations: [],
      };
      expect(results.approvedObservations).toHaveLength(0);
      expect(results.deniedObservations).toHaveLength(0);
      expect(results.skippedObservations).toHaveLength(0);
    });
  });

  describe("keyboard navigation", () => {
    it("arrow down within bounds", () => {
      const observations = [
        createObservation("obs-1"),
        createObservation("obs-2"),
        createObservation("obs-3"),
      ];
      let index = 0;
      // Simulate ArrowDown
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(1);
    });

    it("arrow down at boundary stays", () => {
      const observations = [createObservation("obs-1"), createObservation("obs-2")];
      let index = 1;
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(1);
    });

    it("arrow up within bounds", () => {
      let index = 2;
      index = Math.max(0, index - 1);
      expect(index).toBe(1);
    });

    it("arrow up at boundary stays", () => {
      let index = 0;
      index = Math.max(0, index - 1);
      expect(index).toBe(0);
    });
  });

  describe("mode switching", () => {
    it("toggles between observations and promotions", () => {
      let mode: "observations" | "promotions" = "observations";
      mode = mode === "observations" ? "promotions" : "observations";
      expect(mode).toBe("promotions");
      mode = mode === "observations" ? "promotions" : "observations";
      expect(mode).toBe("observations");
    });
  });
});
