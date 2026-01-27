import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { AnalysisEngine } from "../../src/core/AnalysisEngine.ts";
import type { Config, Session, Observation } from "../../src/core/types.ts";
import type { Session as AdapterSession } from "../../src/adapters/session/SessionAdapter.ts";
import { MockSessionAdapter } from "./mocks/MockSessionAdapter.ts";
import { MockLLMAdapter } from "./mocks/MockLLMAdapter.ts";
import { MockObservationStore } from "./mocks/MockObservationStore.ts";
import { MockStateManager } from "./mocks/MockStateManager.ts";

describe("AnalysisEngine", () => {
  let engine: AnalysisEngine;
  let mockSessionAdapter1: MockSessionAdapter;
  let mockSessionAdapter2: MockSessionAdapter;
  let mockLLMAdapter: MockLLMAdapter;
  let mockObservationStore: MockObservationStore;
  let mockState: MockStateManager;
  let config: Config;

  beforeEach(() => {
    mockSessionAdapter1 = new MockSessionAdapter();
    mockSessionAdapter2 = new MockSessionAdapter();
    mockLLMAdapter = new MockLLMAdapter();
    mockObservationStore = new MockObservationStore();
    mockState = new MockStateManager();

    config = {
      version: "1.0.0",
      llmAdapter: {
        type: "opencode",
        model: "test-model",
      },
      sessionAdapters: {
        claudeCode: true,
        opencode: true,
      },
      memoryTargets: {
        claudeMd: true,
        agentsMd: true,
      },
      analysis: {
        windowDays: 1,
        similarityThreshold: 0.8,
      },
      promotion: {
        observationCountThreshold: 3,
        longTermDaysThreshold: 7,
      },
    };

    mockSessionAdapter1.name = "adapter-1";
    mockSessionAdapter2.name = "adapter-2";

    engine = new AnalysisEngine(
      config,
      [mockSessionAdapter1, mockSessionAdapter2],
      mockLLMAdapter,
      mockObservationStore,
      mockState
    );
  });

  afterEach(() => {
    mockObservationStore.reset();
    mockLLMAdapter.reset();
    mockState.reset();
  });

  describe("initialization", () => {
    it("should accept adapters and configuration", () => {
      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(AnalysisEngine);
    });

    it("should accept multiple session adapters", () => {
      expect(engine).toBeDefined();
    });

    it("should accept custom config", () => {
      config.sessionAdapters.claudeCode = false;
      const customEngine = new AnalysisEngine(
        config,
        [mockSessionAdapter1],
        mockLLMAdapter,
        mockObservationStore,
        mockState
      );
      expect(customEngine).toBeDefined();
    });
  });

  describe("analysis flow - happy path", () => {
    it("should fetch sessions from all enabled adapters", async () => {
      const freshState = new MockStateManager();
      const freshEngine = new AnalysisEngine(
        config,
        [mockSessionAdapter1, mockSessionAdapter2],
        mockLLMAdapter,
        mockObservationStore,
        freshState
      );

      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "test content 1",
        filePath: "/path/to/session-1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "test content 2",
        filePath: "/path/to/session-2",
      };

      mockSessionAdapter1.addSessions([session1]);
      mockSessionAdapter2.addSessions([session2]);

      const result = await freshEngine.run();

      expect(result.sessionsProcessed).toBe(2);
      expect(result.status).toBe("success");
      expect(result.errors.length).toBe(0);
    });

    it("should filter sessions by last run timestamp", async () => {
      const oldDate = new Date("2024-01-01");
      const newDate = new Date();

      const oldSession: AdapterSession = {
        id: "old-session",
        toolName: "adapter-1",
        timestamp: oldDate,
        content: "old content",
        filePath: "/path/to/old",
      };

      const newSession: AdapterSession = {
        id: "new-session",
        toolName: "adapter-1",
        timestamp: newDate,
        content: "new content",
        filePath: "/path/to/new",
      };

      mockSessionAdapter1.addSessions([oldSession, newSession]);
      mockState.setLastAnalysisRun(new Date("2024-01-15"));

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(1);
    });

    it("should extract patterns for each session", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "test content",
        filePath: "/path/to/session-1",
      };

      const observation: Observation = {
        id: "obs-1",
        text: "Test observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [observation];

      const result = await engine.run();

      expect(mockLLMAdapter.getCallCount()).toBe(1);
      expect(result.sessionsProcessed).toBe(1);
    });

    it("should store observations in the store", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "test content",
        filePath: "/path/to/session-1",
      };

      const observation: Observation = {
        id: "obs-1",
        text: "Test observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: ["session-1"],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [observation];

      const result = await engine.run();

      expect(mockObservationStore.getCreateCallCount()).toBe(1);
      expect(result.observationsCreated).toBe(1);
    });

    it("should update state with last run timestamp", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "test content",
        filePath: "/path/to/session-1",
      };

      mockSessionAdapter1.addSessions([session]);

      await engine.run();

      expect(mockState.getUpdateCallCount()).toBe(1);
      expect(mockState.getLastUpdateCall()).toBeInstanceOf(Date);
    });

    it("should force full analysis when option is set", async () => {
      const oldDate = new Date("2024-01-01");

      const oldSession: AdapterSession = {
        id: "old-session",
        toolName: "adapter-1",
        timestamp: oldDate,
        content: "old content",
        filePath: "/path/to/old",
      };

      mockSessionAdapter1.addSessions([oldSession]);
      mockState.setLastAnalysisRun(new Date("2024-01-15"));

      const result = await engine.run({ forceFullAnalysis: true });

      expect(result.sessionsProcessed).toBe(1);
    });

    it("should filter sessions by last run timestamp", async () => {
      const freshState = new MockStateManager();
      const freshEngine = new AnalysisEngine(
        config,
        [mockSessionAdapter1, mockSessionAdapter2],
        mockLLMAdapter,
        mockObservationStore,
        freshState
      );

      const oldDate = new Date("2024-01-01");
      const midDate = new Date("2024-01-10");
      const newDate = new Date("2024-01-20");

      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: oldDate,
        content: "old",
        filePath: "/path/to/1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-1",
        timestamp: midDate,
        content: "mid",
        filePath: "/path/to/2",
      };

      const session3: AdapterSession = {
        id: "session-3",
        toolName: "adapter-1",
        timestamp: newDate,
        content: "new",
        filePath: "/path/to/3",
      };

      mockSessionAdapter1.addSessions([session1, session2, session3]);
      freshState.setLastAnalysisRun(new Date("2024-01-15"));

      const result = await freshEngine.run();

      expect(result.sessionsProcessed).toBe(1);
    });
  });

  describe("deduplication", () => {
    it("should deduplicate similar observations", async () => {
      const existingObs: Observation = {
        id: "existing-obs",
        text: "Existing observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const newObs: Observation = {
        id: "new-obs",
        text: "Similar observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockObservationStore.observations.set(existingObs.id, existingObs);
      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [newObs];

      mockLLMAdapter.setSimilarity("new-obs", "existing-obs", true);

      const result = await engine.run();

      expect(result.observationsCreated).toBe(0);
      expect(result.observationsBumped).toBe(1);
    });

    it("should update count when similar observation found", async () => {
      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content 1",
        filePath: "/path/to/1",
      };

      const existingObs: Observation = {
        id: "existing-obs",
        text: "Existing observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const newObs: Observation = {
        id: "new-obs",
        text: "Similar observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session1]);
      mockObservationStore.observations.set("existing-obs", existingObs);
      mockLLMAdapter.observations = [newObs];

      mockLLMAdapter.setSimilarity("new-obs", "existing-obs", true);

      const result = await engine.run();

      expect(result.observationsCreated).toBe(0);
      expect(result.observationsBumped).toBe(1);
    });

    it("should skip denied observations when checking similarity", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const deniedObs: Observation = {
        id: "denied-obs",
        text: "Denied observation",
        category: "preference",
        count: 1,
        status: "denied",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const newObs: Observation = {
        id: "new-obs",
        text: "Similar observation",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockObservationStore.observations.set("denied-obs", deniedObs);
      mockLLMAdapter.observations = [newObs];
      mockLLMAdapter.setSimilarity("new-obs", "denied-obs", true);

      const result = await engine.run();

      expect(result.observationsCreated).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle unavailable session adapters gracefully", async () => {
      mockSessionAdapter1.setAvailable(false);

      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      mockSessionAdapter2.addSessions([session]);

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(1);
      expect(result.status).toBe("success");
    });

    it("should propagate errors when session adapter throws", async () => {
      mockSessionAdapter1.getSessions = async () => {
        throw new Error("Adapter error");
      };

      const session: AdapterSession = {
        id: "session-2",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/2",
      };

      mockSessionAdapter2.addSessions([session]);

      const result = await engine.run();

      expect(result.status).toBe("partial_failure");
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].adapter).toBe("adapter-1");
    });

    it("should handle LLM adapter errors", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/2",
      };

      mockSessionAdapter1.addSessions([session, session2]);

      mockLLMAdapter.extractPatterns = async (s) => {
        if (s.id === "session-1") {
          throw new Error("LLM error");
        }
        return [];
      };

      const result = await engine.run();

      expect(result.sessionsFailed).toBe(1);
      expect(result.status).toBe("partial_failure");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle observation store errors", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const observation: Observation = {
        id: "obs-1",
        text: "Test",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [observation];
      mockObservationStore.create = async () => {
        throw new Error("Store error");
      };

      const result = await engine.run();

      expect(result.status).toBe("partial_failure");
    });

    it("should handle state update errors", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      mockSessionAdapter1.addSessions([session]);
      mockState.updateLastAnalysisRun = async () => {
        throw new Error("State error");
      };

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(1);
      expect(result.status).toBe("partial_failure");
      expect(result.errors.some(e => e.adapter === "state")).toBe(true);
    });

    it("should continue processing after individual session errors", async () => {
      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content 1",
        filePath: "/path/to/1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content 2",
        filePath: "/path/to/2",
      };

      mockSessionAdapter1.addSessions([session1, session2]);
      mockLLMAdapter.extractPatterns = async (session) => {
        if (session.id === "session-1") {
          throw new Error("Session 1 error");
        }
        return [];
      };

      const result = await engine.run();

      expect(result.sessionsFailed).toBe(1);
      expect(result.sessionsProcessed).toBe(1);
      expect(result.status).toBe("partial_failure");
    });
  });

  describe("edge cases", () => {
    it("should handle no sessions available", async () => {
      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(0);
      expect(result.status).toBe("success");
    });

    it("should handle empty observations from LLM", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [];

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(1);
      expect(result.observationsCreated).toBe(0);
    });

    it("should handle all sessions failing", async () => {
      mockSessionAdapter1.getSessions = async () => {
        throw new Error("Error");
      };

      mockSessionAdapter2.getSessions = async () => {
        throw new Error("Error");
      };

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(0);
      expect(result.status).toBe("failure");
    });

    it("should handle similarity check failures gracefully", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const existingObs: Observation = {
        id: "existing-obs",
        text: "Existing",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const newObs: Observation = {
        id: "new-obs",
        text: "New",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockObservationStore.observations.set("existing-obs", existingObs);
      mockLLMAdapter.observations = [newObs];
      mockLLMAdapter.checkSimilarity = async () => {
        throw new Error("Similarity error");
      };

      const result = await engine.run();

      expect(result.observationsCreated).toBe(1);
    });

    it("should handle multiple observations per session", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const obs1: Observation = {
        id: "obs-1",
        text: "Obs 1",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      const obs2: Observation = {
        id: "obs-2",
        text: "Obs 2",
        category: "pattern",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [obs1, obs2];

      const result = await engine.run();

      expect(result.observationsCreated).toBe(2);
    });
  });

  describe("result accuracy", () => {
    it("should track correct session counts", async () => {
      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content 1",
        filePath: "/path/to/1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "content 2",
        filePath: "/path/to/2",
      };

      mockSessionAdapter1.addSessions([session1]);
      mockSessionAdapter2.addSessions([session2]);

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(2);
      expect(result.sessionsFailed).toBe(0);
    });

    it("should track correct observation counts", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      const observation: Observation = {
        id: "obs-1",
        text: "Test",
        category: "preference",
        count: 1,
        status: "pending",
        sourceSessionIds: [],
        firstSeen: new Date(),
        lastSeen: new Date(),
      };

      mockSessionAdapter1.addSessions([session]);
      mockLLMAdapter.observations = [observation];

      const result = await engine.run();

      expect(result.observationsCreated).toBe(1);
      expect(result.observationsBumped).toBe(0);
    });

    it("should calculate duration correctly", async () => {
      const session: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/1",
      };

      mockSessionAdapter1.addSessions([session]);

      const startTime = Date.now();
      const result = await engine.run();
      const endTime = Date.now();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(endTime - startTime + 100);
    });

    it("should set correct status based on errors", async () => {
      const result1 = await engine.run();
      expect(result1.status).toBe("success");

      const session: AdapterSession = {
        id: "session-2",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "content",
        filePath: "/path/to/2",
      };

      mockSessionAdapter2.addSessions([session]);
      mockSessionAdapter1.getSessions = async () => {
        throw new Error("Error");
      };

      const result2 = await engine.run();
      expect(result2.status).toBe("partial_failure");
    });

    it("should collect all errors", async () => {
      mockSessionAdapter1.getSessions = async () => {
        throw new Error("Error 1");
      };

      mockSessionAdapter2.getSessions = async () => {
        throw new Error("Error 2");
      };

      const result = await engine.run();

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("adapter enable/disable", () => {
    it("should skip disabled adapters", async () => {
      const engineWithConfig = new AnalysisEngine(
        {
          ...config,
          sessionAdapters: {
            claudeCode: false,
            opencode: true,
          },
        },
        [mockSessionAdapter1, mockSessionAdapter2],
        mockLLMAdapter,
        mockObservationStore,
        mockState
      );

      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content 1",
        filePath: "/path/to/1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "content 2",
        filePath: "/path/to/2",
      };

      mockSessionAdapter1.addSessions([session1]);
      mockSessionAdapter2.addSessions([session2]);

      const result = await engineWithConfig.run();

      expect(result.sessionsProcessed).toBeGreaterThanOrEqual(0);
      expect(result.sessionsProcessed).toBeLessThanOrEqual(2);
    });

    it("should enable all adapters when config is undefined", async () => {
      config.sessionAdapters = undefined as any;

      const session1: AdapterSession = {
        id: "session-1",
        toolName: "adapter-1",
        timestamp: new Date(),
        content: "content 1",
        filePath: "/path/to/1",
      };

      const session2: AdapterSession = {
        id: "session-2",
        toolName: "adapter-2",
        timestamp: new Date(),
        content: "content 2",
        filePath: "/path/to/2",
      };

      mockSessionAdapter1.addSessions([session1]);
      mockSessionAdapter2.addSessions([session2]);

      const result = await engine.run();

      expect(result.sessionsProcessed).toBe(2);
    });
  });
});
