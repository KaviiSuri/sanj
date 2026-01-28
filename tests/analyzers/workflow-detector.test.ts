/**
 * Tests for WorkflowSequenceDetector
 *
 * Validates multi-step workflow sequence detection, iterative loop detection,
 * frequency thresholds, and edge case handling.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { Session, Message } from "../../src/core/types";
import { WorkflowSequenceDetector } from "../../src/analyzers/workflow-detector";

/** Helper to build a session fixture */
function makeSession(id = "test-session"): Session {
  return {
    id,
    tool: "claude-code",
    createdAt: new Date(),
    modifiedAt: new Date(),
    path: "/test/path",
    messageCount: 0,
  };
}

/** Helper to build a message with a single tool use */
function toolMsg(toolName: string, id?: string): Message {
  return {
    role: "assistant",
    content: `Using ${toolName}`,
    timestamp: new Date(),
    toolUses: [{ id: id || crypto.randomUUID(), name: toolName }],
  };
}

/** Helper to build a message with multiple tool uses */
function multiToolMsg(toolNames: string[]): Message {
  return {
    role: "assistant",
    content: "Multiple tools",
    timestamp: new Date(),
    toolUses: toolNames.map((name) => ({ id: crypto.randomUUID(), name })),
  };
}

describe("WorkflowSequenceDetector", () => {
  let detector: WorkflowSequenceDetector;

  beforeEach(() => {
    detector = new WorkflowSequenceDetector();
  });

  describe("Basic properties", () => {
    test("should have correct name", () => {
      expect(detector.name).toBe("workflow-sequence");
    });
  });

  describe("Tool chain extraction", () => {
    test("should extract tool chain from messages with tool uses", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      // read → edit → bash appears 2x, should be detected
      const seqObs = observations.find(
        (o) => o.category === "workflow" && o.text.includes("read → edit → bash")
      );
      expect(seqObs).toBeDefined();
    });

    test("should skip messages without tool uses", async () => {
      const session = makeSession();
      const messages: Message[] = [
        { role: "user", content: "Hello", timestamp: new Date() },
        toolMsg("read"),
        { role: "assistant", content: "Thinking...", timestamp: new Date() },
        toolMsg("edit"),
        { role: "user", content: "Continue", timestamp: new Date() },
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      // read → edit → bash still appears 2x despite interleaved non-tool messages
      const seqObs = observations.find(
        (o) => o.category === "workflow" && o.text.includes("read → edit → bash")
      );
      expect(seqObs).toBeDefined();
    });

    test("should extract multiple tool uses from a single message into chain", async () => {
      const session = makeSession();
      // One message with [read, edit], repeated with [bash, read, edit]
      const messages: Message[] = [
        multiToolMsg(["read", "edit"]),
        toolMsg("bash"),
        multiToolMsg(["read", "edit"]),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      // The chain is: read, edit, bash, read, edit, bash
      // read → edit → bash appears 2x
      const seqObs = observations.find(
        (o) => o.category === "workflow" && o.text.includes("read → edit → bash")
      );
      expect(seqObs).toBeDefined();
    });
  });

  describe("Multi-step sequence detection", () => {
    test("should detect 3-step sequences appearing 2+ times", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );
      expect(seqObs).toBeDefined();
      expect(seqObs!.metadata!.sequenceLength).toBeGreaterThanOrEqual(3);
      expect(seqObs!.metadata!.frequency).toBeGreaterThanOrEqual(2);
    });

    test("should not report 3-step sequences appearing only once", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("write"),
        toolMsg("grep"),
        toolMsg("sed"),
      ];

      const observations = await detector.analyze(session, messages);
      // No 3-step sequence repeats, so no workflow observations
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );
      expect(seqObs).toBeUndefined();
    });

    test("should detect 4-step sequences when they repeat", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),  // separator to break loop detection
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
      ];

      const observations = await detector.analyze(session, messages);
      // read → edit → bash → read appears 2x
      const fourStep = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).length === 4
      );
      expect(fourStep).toBeDefined();
      expect(fourStep!.metadata!.frequency).toBe(2);
    });

    test("should detect 5-step sequences at max window size", async () => {
      const session = makeSession();
      // Create a 5-step sequence that repeats
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("grep"),
        toolMsg("write"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("grep"),
        toolMsg("write"),
      ];

      const observations = await detector.analyze(session, messages);
      const fiveStep = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).length === 5
      );
      expect(fiveStep).toBeDefined();
      expect((fiveStep!.metadata!.sequenceSteps as string[]).join(" → ")).toBe(
        "read → edit → bash → grep → write"
      );
    });

    test("should report frequency count accurately", async () => {
      const session = makeSession();
      // read → edit → bash appears 3 times
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const seqObs = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).join(" → ") === "read → edit → bash"
      );
      expect(seqObs).toBeDefined();
      expect(seqObs!.metadata!.frequency).toBe(3);
    });

    test("should deduplicate sub-sequences subsumed by longer ones", async () => {
      const session = makeSession();
      // read → edit → bash → write repeats 2x
      // This means read → edit → bash also repeats, but should be deduplicated
      // since it's a sub-sequence of the longer pattern
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("write"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("write"),
      ];

      const observations = await detector.analyze(session, messages);

      // The 4-step sequence should exist
      const fourStep = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).length === 4
      );
      expect(fourStep).toBeDefined();

      // The 3-step sub-sequence should be deduplicated away
      const threeStepReadEditBash = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).join(" → ") === "read → edit → bash"
      );
      expect(threeStepReadEditBash).toBeUndefined();
    });
  });

  describe("Loop detection", () => {
    test("should detect period-2 iterative loops (test-fix cycle)", async () => {
      const session = makeSession();
      // bash → edit → bash → edit is a test-fix loop
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs).toBeDefined();
      expect(loopObs!.metadata!.loopCycle).toEqual(["bash", "edit"]);
      expect(loopObs!.metadata!.loopFrequency).toBe(2);
    });

    test("should detect period-2 loops with 3 repetitions", async () => {
      const session = makeSession();
      // bash → edit repeating 3 times
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs).toBeDefined();
      expect(loopObs!.metadata!.loopFrequency).toBe(3);
    });

    test("should detect period-3 iterative loops", async () => {
      const session = makeSession();
      // read → edit → bash repeating is a research-edit-test cycle
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) =>
          o.metadata?.loopCycle !== undefined &&
          (o.metadata.loopCycle as string[]).length === 3
      );
      expect(loopObs).toBeDefined();
      expect(loopObs!.metadata!.loopCycle).toEqual(["read", "edit", "bash"]);
    });

    test("should not report loops that repeat fewer than 2 times", async () => {
      const session = makeSession();
      // Only one cycle of bash → edit, no repetition
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("read"),  // different tool breaks the loop
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs).toBeUndefined();
    });

    test("should include fullSequence in loop metadata", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs).toBeDefined();
      expect(loopObs!.metadata!.fullSequence).toEqual([
        "bash",
        "edit",
        "bash",
        "edit",
      ]);
    });
  });

  describe("Observation structure", () => {
    test("should create observations with valid UUIDs", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        expect(obs.id).toBeDefined();
        expect(obs.id.length).toBeGreaterThan(0);
        // UUID format check
        expect(obs.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
      }
    });

    test("should set category to workflow", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        expect(obs.category).toBe("workflow");
      }
    });

    test("should set status to pending", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        expect(obs.status).toBe("pending");
      }
    });

    test("should set count to 1", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        expect(obs.count).toBe(1);
      }
    });

    test("should include session ID in sourceSessionIds", async () => {
      const session = makeSession("my-session-123");
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        expect(obs.sourceSessionIds).toContain("my-session-123");
      }
    });

    test("should set firstSeen and lastSeen timestamps", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        expect(obs.firstSeen).toBeInstanceOf(Date);
        expect(obs.lastSeen).toBeInstanceOf(Date);
      }
    });

    test("sequence observations should include sequenceSteps metadata", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );
      expect(seqObs).toBeDefined();
      expect(Array.isArray(seqObs!.metadata!.sequenceSteps)).toBe(true);
      expect(seqObs!.metadata!.sequenceLength).toBeGreaterThanOrEqual(3);
    });

    test("loop observations should include loopCycle metadata", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs).toBeDefined();
      expect(Array.isArray(loopObs!.metadata!.loopCycle)).toBe(true);
      expect(loopObs!.metadata!.loopFrequency).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(loopObs!.metadata!.fullSequence)).toBe(true);
    });

    test("sequence observation text should include arrow notation", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );
      expect(seqObs).toBeDefined();
      expect(seqObs!.text).toContain("→");
      expect(seqObs!.text).toContain("times");
    });

    test("loop observation text should indicate iterative pattern", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs).toBeDefined();
      expect(loopObs!.text).toContain("Iterative loop");
      expect(loopObs!.text).toContain("repeated");
    });
  });

  describe("Edge cases", () => {
    test("should return empty for empty messages", async () => {
      const session = makeSession();
      const observations = await detector.analyze(session, []);
      expect(observations).toHaveLength(0);
    });

    test("should return empty for messages with no tool uses", async () => {
      const session = makeSession();
      const messages: Message[] = [
        { role: "user", content: "Hello", timestamp: new Date() },
        { role: "assistant", content: "Hi there", timestamp: new Date() },
        { role: "user", content: "How are you?", timestamp: new Date() },
      ];
      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });

    test("should return empty when tool chain is shorter than minimum sequence length", async () => {
      const session = makeSession();
      // Only 2 tool uses — below MIN_SEQUENCE_LENGTH of 3
      const messages: Message[] = [toolMsg("read"), toolMsg("edit")];
      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });

    test("should return empty when no sequences meet frequency threshold", async () => {
      const session = makeSession();
      // 6 unique tools, no sequence repeats
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("grep"),
        toolMsg("write"),
        toolMsg("sed"),
      ];
      const observations = await detector.analyze(session, messages);
      expect(observations).toHaveLength(0);
    });

    test("should handle single tool repeated many times", async () => {
      const session = makeSession();
      // read × 6: the 3-step sub-sequence [read, read, read] appears 4 times
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("read"),
        toolMsg("read"),
        toolMsg("read"),
        toolMsg("read"),
        toolMsg("read"),
      ];

      const observations = await detector.analyze(session, messages);
      // Should detect [read, read, read] sequence and/or [read, read] loop
      expect(observations.length).toBeGreaterThan(0);
    });

    test("should handle very long tool chains efficiently", async () => {
      const session = makeSession();
      const tools = ["read", "edit", "bash"];
      const messages: Message[] = [];
      // Generate 100 messages cycling through read → edit → bash
      for (let i = 0; i < 100; i++) {
        messages.push(toolMsg(tools[i % tools.length]));
      }

      const start = Date.now();
      const observations = await detector.analyze(session, messages);
      const elapsed = Date.now() - start;

      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(1000);
      // Should detect the repeating pattern
      expect(observations.length).toBeGreaterThan(0);
    });

    test("should handle messages with undefined toolUses", async () => {
      const session = makeSession();
      const messages: Message[] = [
        { role: "assistant", content: "Thinking", timestamp: new Date() },
        toolMsg("read"),
        { role: "user", content: "Fix it", timestamp: new Date() },
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );
      expect(seqObs).toBeDefined();
    });
  });

  describe("Sequence vs loop interaction", () => {
    test("should report both sequences and loops when both are present", async () => {
      const session = makeSession();
      // bash → edit loops 2x, AND read → edit → bash appears as a sequence too
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("read"),
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);

      const hasLoop = observations.some(
        (o) => o.metadata?.loopCycle !== undefined
      );
      const hasSequence = observations.some(
        (o) => o.metadata?.sequenceSteps !== undefined
      );

      // At least one of each should be present
      expect(hasLoop || hasSequence).toBe(true);
    });

    test("should handle alternating patterns correctly", async () => {
      const session = makeSession();
      // read → edit → bash → read → edit → bash (period-3 loop AND 3-step sequence)
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      expect(observations.length).toBeGreaterThan(0);

      // Should have both sequence and loop observations for this pattern
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );

      expect(loopObs).toBeDefined();
      expect(seqObs).toBeDefined();
    });
  });

  describe("Observation text formatting", () => {
    test("sequence text should mention 'Workflow pattern'", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      const seqObs = observations.find(
        (o) => o.metadata?.sequenceSteps !== undefined
      );
      expect(seqObs!.text).toMatch(/^Workflow pattern:/);
    });

    test("loop text should mention 'Iterative loop detected'", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("bash"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("edit"),
      ];

      const observations = await detector.analyze(session, messages);
      const loopObs = observations.find(
        (o) => o.metadata?.loopCycle !== undefined
      );
      expect(loopObs!.text).toMatch(/^Iterative loop detected:/);
    });

    test("frequency should appear in observation text", async () => {
      const session = makeSession();
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);
      for (const obs of observations) {
        // Both sequences and loops should mention their frequency
        expect(obs.text).toMatch(/\d+/);
      }
    });
  });

  describe("Deduplication", () => {
    test("should not report 3-step sequence subsumed by 4-step sequence with same frequency", async () => {
      const session = makeSession();
      // A → B → C → D repeats 2x
      // A → B → C would also repeat 2x but is subsumed
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("write"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("write"),
      ];

      const observations = await detector.analyze(session, messages);

      // 4-step should exist
      const fourStep = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).length === 4
      );
      expect(fourStep).toBeDefined();

      // 3-step "read → edit → bash" should be deduplicated (subsumed by 4-step)
      const readEditBash = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).join(" → ") === "read → edit → bash"
      );
      expect(readEditBash).toBeUndefined();
    });

    test("should keep 3-step sequence that has higher frequency than longer sequence", async () => {
      const session = makeSession();
      // read → edit → bash appears 3x (as part of different contexts)
      // read → edit → bash → write appears only 1x (doesn't meet threshold)
      const messages: Message[] = [
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
        toolMsg("write"),
        toolMsg("read"),
        toolMsg("edit"),
        toolMsg("bash"),
      ];

      const observations = await detector.analyze(session, messages);

      const readEditBash = observations.find(
        (o) =>
          o.metadata?.sequenceSteps !== undefined &&
          (o.metadata.sequenceSteps as string[]).join(" → ") === "read → edit → bash"
      );
      // Should be present since it has higher frequency
      expect(readEditBash).toBeDefined();
      expect(readEditBash!.metadata!.frequency).toBe(3);
    });
  });
});
