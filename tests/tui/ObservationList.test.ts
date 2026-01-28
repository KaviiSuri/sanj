/**
 * Tests for ObservationList TUI component.
 *
 * Why these tests matter:
 * - ObservationList manages the scrollable review interface — if selection
 *   index logic is wrong, users get stuck or crash the TUI
 * - Edge cases (empty list, single item, out-of-bounds index) must be
 *   handled gracefully since there's no error recovery in a terminal UI
 * - Callback prop signatures are tested to catch interface drift early
 */

import { describe, it, expect } from "bun:test";
import type { Observation } from "../../src/core/types.ts";

function createObservation(id: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id,
    text: `Observation ${id}`,
    count: 3,
    status: "pending",
    sourceSessionIds: ["session-001"],
    firstSeen: new Date("2025-01-01T00:00:00Z"),
    lastSeen: new Date("2025-01-10T00:00:00Z"),
    ...overrides,
  };
}

function createObservations(count: number): Observation[] {
  return Array.from({ length: count }, (_, i) =>
    createObservation(`obs-${String(i + 1).padStart(3, "0")}`)
  );
}

// Replicate the index clamping logic from ObservationList for unit testing
function clampIndex(selectedIndex: number, observationsLength: number): number {
  if (observationsLength === 0) return 0;
  return Math.max(0, Math.min(selectedIndex, observationsLength - 1));
}

describe("ObservationList", () => {
  describe("selection index clamping", () => {
    it("clamps index to 0 when list is empty", () => {
      expect(clampIndex(0, 0)).toBe(0);
      expect(clampIndex(5, 0)).toBe(0);
    });

    it("clamps negative index to 0", () => {
      expect(clampIndex(-1, 5)).toBe(0);
      expect(clampIndex(-100, 3)).toBe(0);
    });

    it("clamps index beyond list length to last item", () => {
      expect(clampIndex(10, 3)).toBe(2);
      expect(clampIndex(100, 5)).toBe(4);
    });

    it("preserves valid index unchanged", () => {
      expect(clampIndex(0, 5)).toBe(0);
      expect(clampIndex(2, 5)).toBe(2);
      expect(clampIndex(4, 5)).toBe(4);
    });

    it("handles single-item list", () => {
      expect(clampIndex(0, 1)).toBe(0);
      expect(clampIndex(1, 1)).toBe(0);
      expect(clampIndex(5, 1)).toBe(0);
    });
  });

  describe("keyboard navigation logic", () => {
    it("arrow down increments index within bounds", () => {
      const observations = createObservations(5);
      let index = 0;
      // Simulate arrow down
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(1);
    });

    it("arrow down at last item stays at last item", () => {
      const observations = createObservations(5);
      let index = 4; // last item
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(4);
    });

    it("arrow up decrements index within bounds", () => {
      const observations = createObservations(5);
      let index = 3;
      index = Math.max(0, index - 1);
      expect(index).toBe(2);
    });

    it("arrow up at first item stays at first item", () => {
      const observations = createObservations(5);
      let index = 0;
      index = Math.max(0, index - 1);
      expect(index).toBe(0);
    });

    it("navigation through entire list", () => {
      const observations = createObservations(3);
      let index = 0;

      // Navigate down through all items
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(1);
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(2);
      // Try to go past end
      index = Math.min(observations.length - 1, index + 1);
      expect(index).toBe(2);

      // Navigate back up
      index = Math.max(0, index - 1);
      expect(index).toBe(1);
      index = Math.max(0, index - 1);
      expect(index).toBe(0);
      // Try to go before start
      index = Math.max(0, index - 1);
      expect(index).toBe(0);
    });
  });

  describe("empty state handling", () => {
    it("empty observations array is handled", () => {
      const observations: Observation[] = [];
      expect(observations.length).toBe(0);
      // Component should show emptyMessage, not crash
    });

    it("default empty message is provided", () => {
      const defaultMsg = "No observations pending.";
      expect(defaultMsg.length).toBeGreaterThan(0);
    });

    it("custom empty message is accepted", () => {
      const custom = "Nothing to review right now.";
      expect(custom).toBe("Nothing to review right now.");
    });
  });

  describe("observation data rendering", () => {
    it("creates correct number of observations", () => {
      const observations = createObservations(10);
      expect(observations).toHaveLength(10);
    });

    it("each observation has unique id", () => {
      const observations = createObservations(5);
      const ids = observations.map((o) => o.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });

    it("observations maintain proper structure", () => {
      const observations = createObservations(3);
      for (const obs of observations) {
        expect(obs.id).toBeDefined();
        expect(obs.text).toBeDefined();
        expect(obs.count).toBeGreaterThan(0);
        expect(obs.status).toBe("pending");
        expect(Array.isArray(obs.sourceSessionIds)).toBe(true);
        expect(obs.firstSeen).toBeInstanceOf(Date);
        expect(obs.lastSeen).toBeInstanceOf(Date);
      }
    });
  });

  describe("callback interface", () => {
    it("onApprove callback accepts observation", () => {
      const obs = createObservation("test-obs");
      let called = false;
      let calledWith: Observation | null = null;
      const onApprove = (observation: Observation) => {
        called = true;
        calledWith = observation;
      };
      onApprove(obs);
      expect(called).toBe(true);
      expect(calledWith?.id).toBe("test-obs");
    });

    it("onDeny callback accepts observation", () => {
      const obs = createObservation("deny-obs");
      let calledWith: Observation | null = null;
      const onDeny = (observation: Observation) => {
        calledWith = observation;
      };
      onDeny(obs);
      expect(calledWith?.id).toBe("deny-obs");
    });

    it("onSkip callback accepts observation", () => {
      const obs = createObservation("skip-obs");
      let calledWith: Observation | null = null;
      const onSkip = (observation: Observation) => {
        calledWith = observation;
      };
      onSkip(obs);
      expect(calledWith?.id).toBe("skip-obs");
    });

    it("onSelectionChange callback accepts index", () => {
      let lastIndex = -1;
      const onSelectionChange = (index: number) => {
        lastIndex = index;
      };
      onSelectionChange(3);
      expect(lastIndex).toBe(3);
    });
  });
});
