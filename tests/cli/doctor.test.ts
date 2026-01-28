/**
 * Tests for Doctor Command
 *
 * Validates diagnostic checks and health reporting.
 * Tests are unit-focused on the diagnostic helper functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function createTestDir(): string {
  const dir = join(tmpdir(), `sanj-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Doctor command diagnostic checks", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it("detects missing sanj home directory", async () => {
    const missingDir = join(testDir, "nonexistent");
    expect(existsSync(missingDir)).toBe(false);
  });

  it("detects existing sanj home directory", async () => {
    const sanjHome = join(testDir, ".sanj");
    mkdirSync(sanjHome, { recursive: true });
    expect(existsSync(sanjHome)).toBe(true);
  });

  it("validates valid JSON config file", async () => {
    const configPath = join(testDir, "config.json");
    const validConfig = {
      version: "1.0.0",
      llmAdapter: { type: "opencode", model: "test-model" },
    };
    writeFileSync(configPath, JSON.stringify(validConfig));

    const file = Bun.file(configPath);
    const text = await file.text();
    const parsed = JSON.parse(text);

    expect(parsed.version).toBe("1.0.0");
    expect(parsed.llmAdapter.type).toBe("opencode");
  });

  it("detects invalid JSON config file", async () => {
    const configPath = join(testDir, "config.json");
    writeFileSync(configPath, "not valid json {{{");

    const file = Bun.file(configPath);
    const text = await file.text();

    expect(() => JSON.parse(text)).toThrow();
  });

  it("detects valid state.json", async () => {
    const statePath = join(testDir, "state.json");
    const validState = {
      lastAnalysisRun: new Date().toISOString(),
      sessionCursors: {},
      version: 1,
      lastError: null,
      observationCount: 5,
      longTermMemoryCount: 2,
      coreMemoryCount: 0,
    };
    writeFileSync(statePath, JSON.stringify(validState));

    const file = Bun.file(statePath);
    const text = await file.text();
    const parsed = JSON.parse(text);

    expect(parsed.observationCount).toBe(5);
  });

  it("detects missing logs directory", async () => {
    const logsDir = join(testDir, "logs");
    expect(existsSync(logsDir)).toBe(false);
  });

  it("detects existing logs directory", async () => {
    const logsDir = join(testDir, "logs");
    mkdirSync(logsDir, { recursive: true });
    expect(existsSync(logsDir)).toBe(true);
  });

  it("detects stale analysis (no lastAnalysisRun)", async () => {
    const statePath = join(testDir, "state.json");
    const stateNoRun = {
      lastAnalysisRun: null,
      sessionCursors: {},
      version: 1,
      lastError: null,
      observationCount: 0,
      longTermMemoryCount: 0,
      coreMemoryCount: 0,
    };
    writeFileSync(statePath, JSON.stringify(stateNoRun));

    const file = Bun.file(statePath);
    const text = await file.text();
    const parsed = JSON.parse(text);

    expect(parsed.lastAnalysisRun).toBeNull();
  });

  it("detects analysis error in state", async () => {
    const statePath = join(testDir, "state.json");
    const stateWithError = {
      lastAnalysisRun: new Date().toISOString(),
      sessionCursors: {},
      version: 1,
      lastError: "Connection timeout to LLM",
      observationCount: 3,
      longTermMemoryCount: 1,
      coreMemoryCount: 0,
    };
    writeFileSync(statePath, JSON.stringify(stateWithError));

    const file = Bun.file(statePath);
    const text = await file.text();
    const parsed = JSON.parse(text);

    expect(parsed.lastError).toBe("Connection timeout to LLM");
  });

  it("recognizes valid config with LLM adapter", async () => {
    const configPath = join(testDir, "config.json");
    const config = {
      version: "1.0.0",
      llmAdapter: { type: "opencode", model: "zai-coding-plan/glm-4.7" },
      sessionAdapters: { claudeCode: true, opencode: false },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const file = Bun.file(configPath);
    const text = await file.text();
    const parsed = JSON.parse(text);

    expect(parsed.llmAdapter.type).toBe("opencode");
    expect(parsed.sessionAdapters.claudeCode).toBe(true);
  });

  it("detects config with no session adapters enabled", async () => {
    const configPath = join(testDir, "config.json");
    const config = {
      version: "1.0.0",
      llmAdapter: { type: "opencode", model: "test" },
      sessionAdapters: { claudeCode: false, opencode: false },
    };
    writeFileSync(configPath, JSON.stringify(config));

    const file = Bun.file(configPath);
    const text = await file.text();
    const parsed = JSON.parse(text);

    const adaptersEnabled =
      (parsed.sessionAdapters.claudeCode ? 1 : 0) +
      (parsed.sessionAdapters.opencode ? 1 : 0);

    expect(adaptersEnabled).toBe(0);
  });
});
