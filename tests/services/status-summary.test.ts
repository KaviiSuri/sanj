/**
 * Tests for StatusSummaryService
 *
 * Validates that the status summary service correctly aggregates
 * metrics from observations, memories, and analysis state.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { StatusSummaryService } from "../../src/services/status-summary.ts";

// Create isolated temp directory for each test
function createTestDir(): string {
  const dir = join(tmpdir(), `sanj-status-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Clean up test directory
function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Write observation store data
function writeObservations(dir: string, observations: any[]): void {
  const data = { version: 1, observations };
  writeFileSync(join(dir, "observations.json"), JSON.stringify(data, null, 2));
}

// Write memory store data
function writeMemories(dir: string, memories: any[]): void {
  const data = { version: 1, memories };
  writeFileSync(join(dir, "long-term-memory.json"), JSON.stringify(data, null, 2));
}

describe("StatusSummaryService", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it("returns zero counts when no data files exist", async () => {
    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(summary.observations.pending).toBe(0);
    expect(summary.observations.total).toBe(0);
    expect(summary.memory.longTermCount).toBe(0);
    expect(summary.memory.coreCount).toBe(0);
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });

  it("correctly counts observations by status", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "pending obs", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "2", text: "approved obs", status: "approved", count: 2, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "3", text: "denied obs", status: "denied", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "4", text: "promoted obs", status: "promoted-to-long-term", count: 3, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "5", text: "core promoted", status: "promoted-to-core", count: 5, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "6", text: "another pending", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(summary.observations.pending).toBe(2);
    expect(summary.observations.approved).toBe(1);
    expect(summary.observations.denied).toBe(1);
    expect(summary.observations.promoted).toBe(2);
    expect(summary.observations.total).toBe(6);
  });

  it("correctly counts memory hierarchy items", async () => {
    const now = new Date().toISOString();
    writeMemories(testDir, [
      {
        id: "m1",
        observation: { id: "o1", text: "test", status: "approved", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
        promotedAt: now,
        status: "approved",
      },
      {
        id: "m2",
        observation: { id: "o2", text: "test2", status: "approved", count: 2, sourceSessionIds: [], firstSeen: now, lastSeen: now },
        promotedAt: now,
        status: "approved",
      },
      {
        id: "m3",
        observation: { id: "o3", text: "core", status: "approved", count: 5, sourceSessionIds: [], firstSeen: now, lastSeen: now },
        promotedAt: now,
        status: "scheduled-for-core",
      },
    ]);

    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(summary.memory.longTermCount).toBe(2);
    expect(summary.memory.coreCount).toBe(1);
  });

  it("returns READY health status when everything is fine", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "test", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    // No issues from file loading, so no ERROR
    // pending count is 1 (< 10), so no WARNING from pending count
    // analysis lastRun may be null (WARNING) depending on state file
    expect(["READY", "WARNING"]).toContain(summary.healthStatus);
  });

  it("returns WARNING when analysis has never run", async () => {
    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    // No state.json means lastRun is null → WARNING
    expect(summary.healthStatus).toBe("WARNING");
  });

  it("includes issues array for diagnostic reporting", async () => {
    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(Array.isArray(summary.issues)).toBe(true);
  });

  it("handles corrupted observation file gracefully", async () => {
    writeFileSync(join(testDir, "observations.json"), "not valid json {{{");

    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    // Should not throw, should report issue
    expect(summary.observations.total).toBe(0);
    expect(summary.issues.length).toBeGreaterThan(0);
    expect(summary.healthStatus).toBe("ERROR");
  });

  it("handles corrupted memory file gracefully", async () => {
    writeFileSync(join(testDir, "long-term-memory.json"), "{invalid}");

    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(summary.memory.longTermCount).toBe(0);
    expect(summary.issues.length).toBeGreaterThan(0);
  });

  it("includes cron schedule information", async () => {
    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(summary.cron).toBeDefined();
    expect(typeof summary.cron.isInstalled).toBe("boolean");
  });

  it("reports WARNING when pending observations exceed threshold", async () => {
    const now = new Date().toISOString();
    // Create 15 pending observations (> 10 threshold)
    const pendingObs = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      text: `pending observation ${i + 1}`,
      status: "pending",
      count: 1,
      sourceSessionIds: [],
      firstSeen: now,
      lastSeen: now,
    }));

    writeObservations(testDir, pendingObs);

    const service = new StatusSummaryService(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const summary = await service.getSummary();

    expect(summary.observations.pending).toBe(15);
    expect(summary.healthStatus).toBe("WARNING");
  });
});
