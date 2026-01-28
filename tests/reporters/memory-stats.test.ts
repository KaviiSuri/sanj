/**
 * Tests for MemoryStatsReporter
 *
 * Validates that the memory stats reporter correctly calculates
 * statistics across the memory hierarchy.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MemoryStatsReporter } from "../../src/reporters/memory-stats.ts";

function createTestDir(): string {
  const dir = join(tmpdir(), `sanj-memstats-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

function writeMemories(dir: string, memories: any[]): void {
  const data = { version: 1, memories };
  writeFileSync(join(dir, "long-term-memory.json"), JSON.stringify(data, null, 2));
}

describe("MemoryStatsReporter", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it("returns zero counts when no data exists", async () => {
    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.levelCounts.observations).toBe(0);
    expect(stats.levelCounts.longTerm).toBe(0);
    expect(stats.levelCounts.core).toBe(0);
    expect(stats.categoryDistribution).toHaveLength(0);
    expect(stats.topPatterns).toHaveLength(0);
  });

  it("calculates correct level counts", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "obs1", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "2", text: "obs2", status: "approved", count: 2, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "3", text: "obs3", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    writeMemories(testDir, [
      {
        id: "m1",
        observation: { id: "o1", text: "mem1", status: "approved", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
        promotedAt: now,
        status: "approved",
      },
      {
        id: "m2",
        observation: { id: "o2", text: "mem2", status: "approved", count: 2, sourceSessionIds: [], firstSeen: now, lastSeen: now },
        promotedAt: now,
        status: "scheduled-for-core",
      },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.levelCounts.observations).toBe(3);
    expect(stats.levelCounts.longTerm).toBe(1);
    expect(stats.levelCounts.core).toBe(1);
  });

  it("calculates category distribution correctly", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "pref1", category: "preference", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "2", text: "pref2", category: "preference", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "3", text: "pattern1", category: "pattern", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "4", text: "workflow1", category: "workflow", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.categoryDistribution.length).toBe(3);
    // preference should be first (highest count = 2)
    expect(stats.categoryDistribution[0].category).toBe("preference");
    expect(stats.categoryDistribution[0].count).toBe(2);
    expect(stats.categoryDistribution[0].percentage).toBe(50);
  });

  it("handles uncategorized observations", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "no category", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.categoryDistribution.length).toBe(1);
    expect(stats.categoryDistribution[0].category).toBe("uncategorized");
  });

  it("returns top patterns ranked by count", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "high count pattern", category: "pattern", status: "pending", count: 10, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "2", text: "medium count", category: "preference", status: "pending", count: 5, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "3", text: "low count", category: "workflow", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats(3);

    expect(stats.topPatterns.length).toBe(3);
    expect(stats.topPatterns[0].count).toBe(10);
    expect(stats.topPatterns[1].count).toBe(5);
    expect(stats.topPatterns[2].count).toBe(1);
  });

  it("respects topN limit parameter", async () => {
    const now = new Date().toISOString();
    const observations = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      text: `pattern ${i + 1}`,
      status: "pending",
      count: 10 - i,
      sourceSessionIds: [],
      firstSeen: now,
      lastSeen: now,
    }));

    writeObservations(testDir, observations);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats(3);

    expect(stats.topPatterns.length).toBe(3);
  });

  it("truncates long pattern text in top patterns", async () => {
    const now = new Date().toISOString();
    const longText = "A".repeat(200);
    writeObservations(testDir, [
      { id: "1", text: longText, status: "pending", count: 5, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.topPatterns[0].text.length).toBeLessThanOrEqual(103);
    expect(stats.topPatterns[0].text.endsWith("...")).toBe(true);
  });

  it("calculates age distribution with correct buckets", async () => {
    const now = new Date();
    const today = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    const thisWeek = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
    const thisMonth = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(); // 15 days ago
    const older = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago

    writeObservations(testDir, [
      { id: "1", text: "today", status: "pending", count: 1, sourceSessionIds: [], firstSeen: today, lastSeen: today },
      { id: "2", text: "this week", status: "pending", count: 1, sourceSessionIds: [], firstSeen: thisWeek, lastSeen: thisWeek },
      { id: "3", text: "this month", status: "pending", count: 1, sourceSessionIds: [], firstSeen: thisMonth, lastSeen: thisMonth },
      { id: "4", text: "older", status: "pending", count: 1, sourceSessionIds: [], firstSeen: older, lastSeen: older },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.ageDistribution).toHaveLength(4);
    const todayBucket = stats.ageDistribution.find((b) => b.label === "Today");
    const weekBucket = stats.ageDistribution.find((b) => b.label === "This Week");
    const monthBucket = stats.ageDistribution.find((b) => b.label === "This Month");
    const olderBucket = stats.ageDistribution.find((b) => b.label === "Older");

    expect(todayBucket?.count).toBe(1);
    expect(weekBucket?.count).toBe(1);
    expect(monthBucket?.count).toBe(1);
    expect(olderBucket?.count).toBe(1);
  });

  it("calculates status counts correctly", async () => {
    const now = new Date().toISOString();
    writeObservations(testDir, [
      { id: "1", text: "p1", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "2", text: "p2", status: "pending", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "3", text: "a1", status: "approved", count: 2, sourceSessionIds: [], firstSeen: now, lastSeen: now },
      { id: "4", text: "d1", status: "denied", count: 1, sourceSessionIds: [], firstSeen: now, lastSeen: now },
    ]);

    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.statusCounts["pending"]).toBe(2);
    expect(stats.statusCounts["approved"]).toBe(1);
    expect(stats.statusCounts["denied"]).toBe(1);
  });

  it("includes generatedAt timestamp", async () => {
    const reporter = new MemoryStatsReporter(
      join(testDir, "observations.json"),
      join(testDir, "long-term-memory.json")
    );
    const stats = await reporter.getStats();

    expect(stats.generatedAt).toBeInstanceOf(Date);
  });
});
