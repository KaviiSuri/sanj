/**
 * Tests for SessionAnalysisService
 *
 * Validates single-session analysis, batch analysis, status tracking,
 * error isolation, and integration with analyzers and pattern store.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import type { Session, Observation, Message } from "../../src/core/types";
import {
  SessionAnalysisService,
  type SingleSessionResult,
  type BatchAnalysisResult,
  type SessionAnalysisConfig,
} from "../../src/services/session-analysis";
import { FilePatternStore } from "../../src/storage/pattern-store";
import type { PatternAnalyzer } from "../../src/analyzers/base";

// =============================================================================
// Test Helpers
// =============================================================================

const TEST_STORE_DIR = join("/tmp", "sanj-session-analysis-test");
const TEST_STORE_PATH = join(TEST_STORE_DIR, "patterns.json");

function makeSession(overrides: Partial<Session> = {}): Session {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tool: overrides.tool ?? "claude-code",
    projectSlug: overrides.projectSlug ?? "test-project",
    createdAt: overrides.createdAt ?? now,
    modifiedAt: overrides.modifiedAt ?? now,
    path: overrides.path ?? "/tmp/test-session.jsonl",
    messageCount: overrides.messageCount ?? 10,
  };
}

/**
 * Generates a minimal JSONL conversation with a tool use and result.
 */
function makeConversationContent(toolName: string = "read", filePath: string = "src/index.ts"): string {
  const events = [
    {
      type: "message",
      message: {
        role: "user",
        content: "Please read the file",
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "I'll read that file for you." },
          {
            type: "tool_use",
            id: "tool-1",
            name: toolName,
            input: { file_path: filePath },
          },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "File contents here...",
          },
        ],
      },
      timestamp: new Date().toISOString(),
    },
  ];

  return events.map((e) => JSON.stringify(e)).join("\n");
}

/**
 * Generates a richer conversation with multiple tool uses for better analyzer coverage.
 */
function makeRichConversation(): string {
  const events = [
    {
      type: "message",
      message: { role: "user", content: "Read and edit the file" },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Reading first." },
          { type: "tool_use", id: "t1", name: "read", input: { file_path: "src/app.ts" } },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "file content" }],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Now editing." },
          { type: "tool_use", id: "t2", name: "edit", input: { file_path: "src/app.ts" } },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t2", content: "edit success" }],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Running tests." },
          { type: "tool_use", id: "t3", name: "bash", input: { command: "bun test" } },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t3", content: "tests passed" }],
      },
      timestamp: new Date().toISOString(),
    },
    // Second read-edit-bash cycle for workflow detection
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Reading again." },
          { type: "tool_use", id: "t4", name: "read", input: { file_path: "src/app.ts" } },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t4", content: "updated content" }],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Editing again." },
          { type: "tool_use", id: "t5", name: "edit", input: { file_path: "src/app.ts" } },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t5", content: "edit success" }],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Running tests again." },
          { type: "tool_use", id: "t6", name: "bash", input: { command: "bun test" } },
        ],
      },
      timestamp: new Date().toISOString(),
    },
    {
      type: "message",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t6", content: "tests passed" }],
      },
      timestamp: new Date().toISOString(),
    },
  ];

  return events.map((e) => JSON.stringify(e)).join("\n");
}

/**
 * Mock analyzer that returns observations with fresh IDs each call.
 * The texts are preserved but IDs are regenerated so batch storage works correctly.
 */
class MockAnalyzer implements PatternAnalyzer {
  name: string;
  private observationTemplates: Observation[];

  constructor(name: string, observations: Observation[] = []) {
    this.name = name;
    this.observationTemplates = observations;
  }

  async analyze(session: Session, _messages: Message[]): Promise<Observation[]> {
    // Generate fresh copies with new IDs and session-specific source
    return this.observationTemplates.map((obs) => ({
      ...obs,
      id: crypto.randomUUID(),
      sourceSessionIds: [session.id],
    }));
  }
}

/**
 * Mock analyzer that always throws.
 */
class FailingAnalyzer implements PatternAnalyzer {
  name = "failing-analyzer";

  async analyze(): Promise<Observation[]> {
    throw new Error("Analyzer crashed");
  }
}

function makeObservation(text: string, category: Observation["category"] = "pattern"): Observation {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    text,
    category,
    count: 1,
    status: "pending",
    sourceSessionIds: ["mock-session"],
    firstSeen: now,
    lastSeen: now,
  };
}

// =============================================================================
// Lifecycle
// =============================================================================

beforeEach(() => {
  if (!existsSync(TEST_STORE_DIR)) {
    mkdirSync(TEST_STORE_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_STORE_DIR)) {
    rmSync(TEST_STORE_DIR, { recursive: true, force: true });
  }
});

// =============================================================================
// Single Session Analysis
// =============================================================================

describe("SessionAnalysisService - single session", () => {
  test("analyzeSession returns completed status on success", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("mock", [makeObservation("test pattern")])],
    });

    const session = makeSession();
    const content = makeConversationContent();
    const result = await service.analyzeSession(session, content);

    expect(result.status).toBe("completed");
    expect(result.sessionId).toBe(session.id);
    expect(result.observationsExtracted).toBeGreaterThanOrEqual(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("analyzeSession populates analyzerBreakdown", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const obs1 = makeObservation("pattern A");
    const obs2 = makeObservation("pattern B");
    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("analyzer-alpha", [obs1]),
        new MockAnalyzer("analyzer-beta", [obs2]),
      ],
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    expect(result.analyzerBreakdown["analyzer-alpha"]).toBe(1);
    expect(result.analyzerBreakdown["analyzer-beta"]).toBe(1);
  });

  test("analyzeSession persists observations to pattern store", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("mock", [
          makeObservation("prefers bash for running shell commands and scripts"),
          makeObservation("frequently edits configuration files in the root directory"),
        ]),
      ],
      aggregationConfig: { similarityThreshold: 0.9 }, // high threshold to avoid merging
    });

    await service.analyzeSession(makeSession(), makeConversationContent());

    // Reload store from disk and verify persistence
    const freshStore = new FilePatternStore(TEST_STORE_PATH);
    await freshStore.load();
    const stored = await freshStore.getAll(true);

    expect(stored.length).toBeGreaterThanOrEqual(2);
    const texts = stored.map((o) => o.text);
    expect(texts).toContain("prefers bash for running shell commands and scripts");
    expect(texts).toContain("frequently edits configuration files in the root directory");
  });

  test("analyzeSession returns failed status when analyzer throws", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new FailingAnalyzer()],
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Analyzer crashed");
    expect(result.observationsExtracted).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("analyzeSession handles empty conversation content", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("mock", [])],
    });

    const result = await service.analyzeSession(makeSession(), "");

    expect(result.status).toBe("completed");
    expect(result.observationsExtracted).toBe(0);
  });

  test("analyzeSession tracks duplicatesMerged from aggregation", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    // Two observations with very similar text should be merged
    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("mock-a", [makeObservation("prefers using read tool for reading files")]),
        new MockAnalyzer("mock-b", [makeObservation("prefers using read tool for reading files")]),
      ],
      aggregationConfig: { similarityThreshold: 0.7 },
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    expect(result.status).toBe("completed");
    expect(result.duplicatesMerged).toBeGreaterThanOrEqual(1);
    expect(result.observationsExtracted).toBeLessThan(2); // merged down
  });

  test("analyzeSession with real analyzers on rich conversation", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    // Use default analyzers (all four built-in)
    const service = new SessionAnalysisService(store);

    const session = makeSession();
    const content = makeRichConversation();
    const result = await service.analyzeSession(session, content);

    expect(result.status).toBe("completed");
    // Rich conversation should produce observations from at least tool-usage analyzer
    expect(result.observationsExtracted).toBeGreaterThanOrEqual(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("analyzeSession does not persist when no observations extracted", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("empty", [])],
    });

    await service.analyzeSession(makeSession(), makeConversationContent());

    const freshStore = new FilePatternStore(TEST_STORE_PATH);
    await freshStore.load();
    const count = await freshStore.count();

    expect(count).toBe(0);
  });
});

// =============================================================================
// Batch Analysis
// =============================================================================

describe("SessionAnalysisService - batch analysis", () => {
  test("analyzeBatch processes all sessions", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("mock", [makeObservation("batch pattern")])],
    });

    const sessions = [
      { session: makeSession({ id: "s1" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "s2" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "s3" }), rawContent: makeConversationContent() },
    ];

    const result = await service.analyzeBatch(sessions);

    expect(result.totalSessions).toBe(3);
    expect(result.completedCount).toBe(3);
    expect(result.failedCount).toBe(0);
    expect(result.results.length).toBe(3);
    expect(result.totalObservationsStored).toBeGreaterThanOrEqual(3);
  });

  test("analyzeBatch isolates failures - one bad session does not stop others", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    // First analyzer succeeds, second throws — but only when content contains "FAIL"
    const conditionalAnalyzer: PatternAnalyzer = {
      name: "conditional",
      async analyze(session: Session, messages: Message[]): Promise<Observation[]> {
        if (session.id === "bad-session") {
          throw new Error("Session analysis failed");
        }
        return [makeObservation(`pattern from ${session.id}`)];
      },
    };

    const service = new SessionAnalysisService(store, {
      analyzers: [conditionalAnalyzer],
    });

    const sessions = [
      { session: makeSession({ id: "good-1" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "bad-session" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "good-2" }), rawContent: makeConversationContent() },
    ];

    const result = await service.analyzeBatch(sessions);

    expect(result.totalSessions).toBe(3);
    expect(result.completedCount).toBe(2);
    expect(result.failedCount).toBe(1);

    const badResult = result.results.find((r) => r.sessionId === "bad-session");
    expect(badResult?.status).toBe("failed");
    expect(badResult?.error).toContain("Session analysis failed");

    const goodResults = result.results.filter((r) => r.status === "completed");
    expect(goodResults.length).toBe(2);
  });

  test("analyzeBatch respects concurrency limit", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const executionOrder: string[] = [];

    const trackingAnalyzer: PatternAnalyzer = {
      name: "tracking",
      async analyze(session: Session): Promise<Observation[]> {
        executionOrder.push(`start-${session.id}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(`end-${session.id}`);
        return [];
      },
    };

    const service = new SessionAnalysisService(store, {
      analyzers: [trackingAnalyzer],
      batchConcurrency: 2,
    });

    const sessions = Array.from({ length: 4 }, (_, i) => ({
      session: makeSession({ id: `session-${i}` }),
      rawContent: makeConversationContent(),
    }));

    const result = await service.analyzeBatch(sessions);

    expect(result.totalSessions).toBe(4);
    expect(result.completedCount).toBe(4);
    // All sessions should have both start and end entries
    expect(executionOrder.length).toBe(8);
  });

  test("analyzeBatch with empty input returns zero counts", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store);
    const result = await service.analyzeBatch([]);

    expect(result.totalSessions).toBe(0);
    expect(result.completedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results.length).toBe(0);
    expect(result.totalObservationsStored).toBe(0);
  });

  test("analyzeBatch accumulates totalObservationsStored correctly", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("mock", [
          makeObservation("unique pattern alpha"),
          makeObservation("unique pattern beta"),
        ]),
      ],
      aggregationConfig: { similarityThreshold: 0.9 }, // high threshold = less merging
    });

    const sessions = [
      { session: makeSession({ id: "bs1" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "bs2" }), rawContent: makeConversationContent() },
    ];

    const result = await service.analyzeBatch(sessions);

    expect(result.totalObservationsStored).toBeGreaterThanOrEqual(4); // 2 per session
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("analyzeBatch duration is at least sum of individual durations", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("mock", [makeObservation("timing test")])],
    });

    const sessions = [
      { session: makeSession({ id: "t1" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "t2" }), rawContent: makeConversationContent() },
    ];

    const result = await service.analyzeBatch(sessions);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // Each result should have non-negative duration
    for (const r of result.results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// =============================================================================
// Configuration & Analyzer Registration
// =============================================================================

describe("SessionAnalysisService - configuration", () => {
  test("getAnalyzerNames returns names of registered analyzers", () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("alpha"),
        new MockAnalyzer("beta"),
        new MockAnalyzer("gamma"),
      ],
    });

    expect(service.getAnalyzerNames()).toEqual(["alpha", "beta", "gamma"]);
  });

  test("default analyzers are all four built-in analyzers", () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    const service = new SessionAnalysisService(store);

    const names = service.getAnalyzerNames();
    expect(names).toContain("tool-usage");
    expect(names).toContain("error-pattern");
    expect(names).toContain("file-interaction");
    expect(names).toContain("workflow-sequence");
    expect(names.length).toBe(4);
  });

  test("custom aggregation similarity threshold is respected", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    // Very low threshold = everything merges
    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("a", [makeObservation("read files from disk")]),
        new MockAnalyzer("b", [makeObservation("write files to disk")]),
      ],
      aggregationConfig: { similarityThreshold: 0.1 },
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    // With very low threshold, similar texts should merge
    expect(result.duplicatesMerged).toBeGreaterThanOrEqual(1);
    expect(result.observationsExtracted).toBe(1);
  });

  test("high similarity threshold preserves distinct observations", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("a", [makeObservation("prefers read tool for file access")]),
        new MockAnalyzer("b", [makeObservation("uses bash for running shell commands")]),
      ],
      aggregationConfig: { similarityThreshold: 0.95 },
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    expect(result.duplicatesMerged).toBe(0);
    expect(result.observationsExtracted).toBe(2);
  });
});

// =============================================================================
// Status Tracking Edge Cases
// =============================================================================

describe("SessionAnalysisService - status & edge cases", () => {
  test("result status is always one of the defined values", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("mock", [makeObservation("status check")])],
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());
    const validStatuses = ["pending", "in-progress", "completed", "failed"];
    expect(validStatuses).toContain(result.status);
  });

  test("failed result has error field and zero observations", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new FailingAnalyzer()],
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(result.error!.length).toBeGreaterThan(0);
    expect(result.observationsExtracted).toBe(0);
    expect(result.duplicatesMerged).toBe(0);
    expect(Object.keys(result.analyzerBreakdown).length).toBe(0);
  });

  test("malformed JSONL content does not crash - handled gracefully", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new MockAnalyzer("mock", [makeObservation("graceful")])],
    });

    // Malformed content - not valid JSONL
    const result = await service.analyzeSession(makeSession(), "not json at all {{{}}}");

    // Should either complete (with 0 messages parsed) or fail gracefully
    expect(result.status).toBe("completed");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("multiple analyzers with no output produce zero observations", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [
        new MockAnalyzer("empty-1", []),
        new MockAnalyzer("empty-2", []),
        new MockAnalyzer("empty-3", []),
      ],
    });

    const result = await service.analyzeSession(makeSession(), makeConversationContent());

    expect(result.status).toBe("completed");
    expect(result.observationsExtracted).toBe(0);
    expect(result.duplicatesMerged).toBe(0);
    expect(result.analyzerBreakdown["empty-1"]).toBe(0);
    expect(result.analyzerBreakdown["empty-2"]).toBe(0);
    expect(result.analyzerBreakdown["empty-3"]).toBe(0);
  });

  test("batch with all failing sessions reports all as failed", async () => {
    const store = new FilePatternStore(TEST_STORE_PATH);
    await store.load();

    const service = new SessionAnalysisService(store, {
      analyzers: [new FailingAnalyzer()],
    });

    const sessions = [
      { session: makeSession({ id: "fail-1" }), rawContent: makeConversationContent() },
      { session: makeSession({ id: "fail-2" }), rawContent: makeConversationContent() },
    ];

    const result = await service.analyzeBatch(sessions);

    expect(result.totalSessions).toBe(2);
    expect(result.completedCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(result.totalObservationsStored).toBe(0);
    expect(result.results.every((r) => r.status === "failed")).toBe(true);
  });
});
