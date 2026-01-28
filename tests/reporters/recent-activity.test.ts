/**
 * Tests for RecentActivityReporter
 *
 * Validates that the recent activity reporter correctly filters
 * and sorts observations by time windows.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  RecentActivityReporter,
  createTimeWindow,
} from "../../src/reporters/recent-activity.ts";

function createTestDir(): string {
  const dir = join(tmpdir(), `sanj-activity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeObservations(dir: string, observations: any[]): void {
  const data = { version: 1, observations };
  writeFileSync(join(dir, "observations.json"), JSON.stringify(data, null, 2));
}

describe("createTimeWindow", () => {
  it("creates a window with correct label for known day counts", () => {
    expect(createTimeWindow(1).label).toBe("24h");
    expect(createTimeWindow(7).label).toBe("7d");
    expect(createTimeWindow(30).label).toBe("30d");
  });

  it("creates a window with generic label for unknown day counts", () => {
    expect(createTimeWindow(14).label).toBe("14d");
    expect(createTimeWindow(3).label).toBe("3d");
  });

  it("sets startDate to the correct number of days ago", () => {
    const window = createTimeWindow(7);
    const now = new Date();
    const expectedStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Allow 1 second tolerance for test execution time
    expect(Math.abs(window.startDate.getTime() - expectedStart.getTime())).toBeLessThan(1000);
  });
});

describe("RecentActivityReporter", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it("returns empty report when no observations exist", async () => {
    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    expect(report.items).toHaveLength(0);
    expect(report.newObservations).toBe(0);
    expect(report.approvedObservations).toBe(0);
    expect(report.deniedObservations).toBe(0);
    expect(report.promotedObservations).toBe(0);
  });

  it("detects recently created observations", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "recent obs", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    expect(report.newObservations).toBe(1);
    expect(report.items.length).toBeGreaterThan(0);
  });

  it("excludes observations older than time window", async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    writeObservations(testDir, [
      { id: "1", text: "old obs", status: "pending", count: 1, sourceSessionIds: [], firstSeen: oldDate.toISOString(), lastSeen: oldDate.toISOString() },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    expect(report.newObservations).toBe(0);
    expect(report.items).toHaveLength(0);
  });

  it("sorts activity items by timestamp descending", async () => {
    const time1 = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    const time2 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    writeObservations(testDir, [
      { id: "1", text: "older observation", status: "pending", count: 1, sourceSessionIds: [], firstSeen: time2, lastSeen: time2 },
      { id: "2", text: "newer observation", status: "pending", count: 1, sourceSessionIds: [], firstSeen: time1, lastSeen: time1 },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    // Items should be sorted newest first
    if (report.items.length >= 2) {
      expect(report.items[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        report.items[1].timestamp.getTime()
      );
    }
  });

  it("counts approved observations in activity window", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "approved obs", status: "approved", count: 2, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    expect(report.approvedObservations).toBe(1);
  });

  it("counts denied observations in activity window", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "denied obs", status: "denied", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    expect(report.deniedObservations).toBe(1);
  });

  it("counts promoted observations in activity window", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "promoted obs", status: "promoted-to-long-term", count: 3, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "2", text: "core promoted", status: "promoted-to-core", count: 5, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    expect(report.promotedObservations).toBe(2);
  });

  it("getRecentObservations returns observations sorted by lastSeen", async () => {
    const time1 = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const time2 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    writeObservations(testDir, [
      { id: "1", text: "older", status: "pending", count: 1, sourceSessionIds: [], firstSeen: time2, lastSeen: time2 },
      { id: "2", text: "newer", status: "pending", count: 1, sourceSessionIds: [], firstSeen: time1, lastSeen: time1 },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const obs = await reporter.getRecentObservations(10, createTimeWindow(7));

    expect(obs.length).toBe(2);
    expect(obs[0].lastSeen.getTime()).toBeGreaterThanOrEqual(obs[1].lastSeen.getTime());
  });

  it("getRecentObservations respects limit parameter", async () => {
    const now = new Date().toISOString();
    const observations = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      text: `observation ${i + 1}`,
      status: "pending",
      count: 1,
      sourceSessionIds: [],
      firstSeen: now,
      lastSeen: now,
    }));

    writeObservations(testDir, observations);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const obs = await reporter.getRecentObservations(3, createTimeWindow(7));

    expect(obs.length).toBe(3);
  });

  it("handles corrupted observation file gracefully", async () => {
    writeFileSync(join(testDir, "observations.json"), "not json");

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));

    // Should throw since ObservationStore.load() throws on invalid JSON
    await expect(reporter.getRecentActivity(createTimeWindow(7))).rejects.toThrow();
  });

  it("includes category in activity items", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "categorized obs", category: "preference", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new RecentActivityReporter(join(testDir, "observations.json"));
    const report = await reporter.getRecentActivity(createTimeWindow(7));

    const createdItem = report.items.find((i) => i.type === "observation-created");
    expect(createdItem?.category).toBe("preference");
  });
});
