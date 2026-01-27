/**
 * Tests for ToolUsageAnalyzer
 *
 * Validates that tool usage patterns are correctly detected and extracted
 * from session messages.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { Session, Message } from "../../src/core/types";
import { ToolUsageAnalyzer } from "../../src/analyzers/tool-usage";

describe("ToolUsageAnalyzer", () => {
  let analyzer: ToolUsageAnalyzer;

  beforeEach(() => {
    analyzer = new ToolUsageAnalyzer();
  });

  describe("Tool frequency detection", () => {
    test("should detect frequently used tools", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 5,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [
            { id: "1", name: "read", input: { path: "test.ts" } },
          ],
        },
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [
            { id: "2", name: "read", input: { path: "test2.ts" } },
          ],
        },
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [
            { id: "3", name: "read", input: { path: "test3.ts" } },
          ],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      const toolChoiceObs = observations.find(
        (obs) => obs.category === "tool-choice"
      );
      expect(toolChoiceObs).toBeDefined();
      expect(toolChoiceObs!.text).toContain("read");
      expect(toolChoiceObs!.metadata?.frequency).toBe(3);
    });

    test("should not create observation for tools below frequency threshold", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 1,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [{ id: "1", name: "read", input: { path: "test.ts" } }],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      const toolChoiceObs = observations.find(
        (obs) => obs.category === "tool-choice"
      );
      expect(toolChoiceObs).toBeUndefined();
    });
  });

  describe("Tool sequence detection", () => {
    test("should detect recurring tool sequences", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 4,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [{ id: "1", name: "read", input: { path: "test.ts" } }],
        },
        {
          role: "assistant",
          content: "Editing file",
          timestamp: new Date(),
          toolUses: [{ id: "2", name: "edit", input: { path: "test.ts" } }],
        },
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [{ id: "3", name: "read", input: { path: "test2.ts" } }],
        },
        {
          role: "assistant",
          content: "Editing file",
          timestamp: new Date(),
          toolUses: [{ id: "4", name: "edit", input: { path: "test2.ts" } }],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      const workflowObs = observations.find(
        (obs) => obs.category === "workflow"
      );
      expect(workflowObs).toBeDefined();
      expect(workflowObs!.text).toContain("read → edit");
      expect(workflowObs!.metadata?.frequency).toBe(2);
    });

    test("should not detect sequences below frequency threshold", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 2,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [{ id: "1", name: "read", input: { path: "test.ts" } }],
        },
        {
          role: "assistant",
          content: "Editing file",
          timestamp: new Date(),
          toolUses: [{ id: "2", name: "edit", input: { path: "test.ts" } }],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      const workflowObs = observations.find(
        (obs) => obs.category === "workflow"
      );
      expect(workflowObs).toBeUndefined();
    });
  });

  describe("Parameter pattern detection", () => {
    test("should detect common parameter values", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 3,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Linting file",
          timestamp: new Date(),
          toolUses: [
            { id: "1", name: "eslint", input: { strict: true } },
          ],
        },
        {
          role: "assistant",
          content: "Linting file",
          timestamp: new Date(),
          toolUses: [
            { id: "2", name: "eslint", input: { strict: true } },
          ],
        },
        {
          role: "assistant",
          content: "Linting file",
          timestamp: new Date(),
          toolUses: [
            { id: "3", name: "eslint", input: { strict: true } },
          ],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      const patternObs = observations.find(
        (obs) => obs.category === "pattern"
      );
      expect(patternObs).toBeDefined();
      expect(patternObs!.text).toContain("eslint");
      expect(patternObs!.text).toContain("strict");
      expect(patternObs!.metadata?.commonParameters).toBeDefined();
      expect(
        (patternObs!.metadata?.commonParameters as Record<string, unknown>).strict
      ).toEqual([true]);
    });

    test("should not create observation for parameters below frequency threshold", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 1,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Linting file",
          timestamp: new Date(),
          toolUses: [
            { id: "1", name: "eslint", input: { strict: true } },
          ],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      const patternObs = observations.find(
        (obs) => obs.category === "pattern"
      );
      expect(patternObs).toBeUndefined();
    });
  });

  describe("Integration", () => {
    test("should extract all types of observations together", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 6,
      };

      const messages: Message[] = [
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [{ id: "1", name: "read", input: { path: "test.ts" } }],
        },
        {
          role: "assistant",
          content: "Editing file",
          timestamp: new Date(),
          toolUses: [{ id: "2", name: "edit", input: { path: "test.ts" } }],
        },
        {
          role: "assistant",
          content: "Reading file",
          timestamp: new Date(),
          toolUses: [{ id: "3", name: "read", input: { path: "test2.ts" } }],
        },
        {
          role: "assistant",
          content: "Editing file",
          timestamp: new Date(),
          toolUses: [{ id: "4", name: "edit", input: { path: "test2.ts" } }],
        },
        {
          role: "assistant",
          content: "Linting file",
          timestamp: new Date(),
          toolUses: [{ id: "5", name: "eslint", input: { strict: true } }],
        },
        {
          role: "assistant",
          content: "Linting file",
          timestamp: new Date(),
          toolUses: [{ id: "6", name: "eslint", input: { strict: true } }],
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      // Should have workflow observation (read→edit sequence appears twice)
      const workflowObs = observations.find((obs) => obs.category === "workflow");
      expect(workflowObs).toBeDefined();
      expect(workflowObs!.metadata?.frequency).toBe(2);
      expect(workflowObs!.metadata?.typicalSequence).toEqual(["read", "edit"]);

      // Tool frequencies are 2 (below MIN_FREQUENCY=3), so no tool-choice observations
      // Parameter frequency is 2 (below MIN_FREQUENCY=3), so no pattern observations
      expect(observations.length).toBe(1);
    });

    test("should handle empty messages gracefully", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 0,
      };

      const messages: Message[] = [];

      const observations = await analyzer.analyze(session, messages);

      expect(observations).toHaveLength(0);
    });

    test("should handle messages without tool uses", async () => {
      const session: Session = {
        id: "test-session",
        tool: "claude-code",
        createdAt: new Date(),
        modifiedAt: new Date(),
        path: "/test/path",
        messageCount: 2,
      };

      const messages: Message[] = [
        { role: "user", content: "Hello", timestamp: new Date() },
        {
          role: "assistant",
          content: "Hi there",
          timestamp: new Date(),
        },
      ];

      const observations = await analyzer.analyze(session, messages);

      expect(observations).toHaveLength(0);
    });
  });
});
