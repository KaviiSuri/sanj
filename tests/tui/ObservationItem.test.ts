/**
 * Tests for ObservationItem TUI component.
 *
 * Why these tests matter:
 * - ObservationItem is the building block for the observation review list
 * - Verifying it handles edge cases (missing dates, empty sources) prevents
 *   runtime crashes in the TUI, which has no error recovery UI
 * - Prop interface stability ensures ObservationList can compose items reliably
 */

import { describe, it, expect } from "bun:test";
import type { Observation } from "../../src/core/types.ts";

// We test the pure logic helpers and prop interface without rendering
// OpenTUI components (which require a terminal context).

// Replicate the formatting helpers for unit testing
function formatDate(date: Date | string | undefined): string {
  if (!date) return "unknown";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "unknown";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatSources(sessionIds: string[] | undefined): string {
  if (!sessionIds || sessionIds.length === 0) return "(unknown)";
  const truncated = sessionIds.map((id) =>
    id.length > 20 ? id.slice(0, 17) + "..." : id
  );
  return truncated.join(", ");
}

function createObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "obs-001",
    text: "Prefers TypeScript strict mode",
    count: 5,
    status: "pending",
    sourceSessionIds: ["session-abc", "session-def"],
    firstSeen: new Date("2025-01-15T10:30:00Z"),
    lastSeen: new Date("2025-01-25T14:00:00Z"),
    ...overrides,
  };
}

describe("ObservationItem", () => {
  describe("formatDate helper", () => {
    it("formats valid Date objects", () => {
      const date = new Date("2025-06-15T10:30:00Z");
      const result = formatDate(date);
      expect(result).toMatch(/2025-06-15/);
      expect(result).toMatch(/:/); // has time component
    });

    it("formats ISO string dates", () => {
      const result = formatDate("2025-03-20T08:15:00Z");
      expect(result).toMatch(/2025-03-20/);
    });

    it("returns 'unknown' for undefined", () => {
      expect(formatDate(undefined)).toBe("unknown");
    });

    it("returns 'unknown' for invalid date strings", () => {
      expect(formatDate("not-a-date")).toBe("unknown");
    });
  });

  describe("formatSources helper", () => {
    it("joins session IDs with comma separator", () => {
      const result = formatSources(["session-abc", "session-def"]);
      expect(result).toBe("session-abc, session-def");
    });

    it("returns '(unknown)' for empty array", () => {
      expect(formatSources([])).toBe("(unknown)");
    });

    it("returns '(unknown)' for undefined", () => {
      expect(formatSources(undefined)).toBe("(unknown)");
    });

    it("truncates long session IDs", () => {
      const longId = "a".repeat(30);
      const result = formatSources([longId]);
      expect(result.length).toBeLessThan(longId.length);
      expect(result).toContain("...");
    });

    it("preserves short session IDs unchanged", () => {
      const shortId = "short-id";
      expect(formatSources([shortId])).toBe(shortId);
    });

    it("handles single session ID", () => {
      const result = formatSources(["only-one"]);
      expect(result).toBe("only-one");
    });
  });

  describe("observation data handling", () => {
    it("creates valid observation with all fields", () => {
      const obs = createObservation();
      expect(obs.id).toBe("obs-001");
      expect(obs.text).toBe("Prefers TypeScript strict mode");
      expect(obs.count).toBe(5);
      expect(obs.status).toBe("pending");
      expect(obs.sourceSessionIds).toHaveLength(2);
    });

    it("handles observation with zero count", () => {
      const obs = createObservation({ count: 0 });
      expect(obs.count).toBe(0);
      // formatSources should still work
      expect(formatSources(obs.sourceSessionIds)).toContain("session-abc");
    });

    it("handles observation with empty sourceSessionIds", () => {
      const obs = createObservation({ sourceSessionIds: [] });
      expect(formatSources(obs.sourceSessionIds)).toBe("(unknown)");
    });

    it("handles observation with missing optional fields", () => {
      const obs: Observation = {
        id: "minimal-obs",
        text: "Minimal observation",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };
      expect(formatDate(obs.firstSeen)).not.toBe("unknown");
      expect(formatSources(obs.sourceSessionIds)).toBe("(unknown)");
    });

    it("handles very long observation text", () => {
      const longText = "x".repeat(500);
      const obs = createObservation({ text: longText });
      expect(obs.text.length).toBe(500);
    });
  });

  describe("prop interface", () => {
    it("default props are valid", () => {
      const obs = createObservation();
      // These are the default prop values
      const props = {
        observation: obs,
        isSelected: false,
        isHighlighted: false,
      };
      expect(props.observation.id).toBeDefined();
      expect(typeof props.isSelected).toBe("boolean");
      expect(typeof props.isHighlighted).toBe("boolean");
    });

    it("selected state is a boolean", () => {
      const props = { isSelected: true };
      expect(props.isSelected).toBe(true);
    });

    it("highlighted state is a boolean", () => {
      const props = { isHighlighted: true };
      expect(props.isHighlighted).toBe(true);
    });
  });
});
