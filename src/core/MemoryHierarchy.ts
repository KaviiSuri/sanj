/**
 * MemoryHierarchy — Core promotion logic for the observation review flow.
 *
 * Manages transitions:
 *   Observation (pending) → Long-Term Memory → Core Memory (CLAUDE.md / AGENTS.md)
 *
 * Enforces configurable thresholds and integrates with ObservationStore for
 * reading observations and CoreMemoryAdapters for writing to final destinations.
 *
 * @module core/MemoryHierarchy
 */

import type { Observation, LongTermMemory, Config } from "./types.ts";
import type { ObservationStore } from "../storage/observation-store.ts";
import type { MemoryStore } from "../storage/memory-store.ts";
import type { CoreMemoryAdapter } from "../adapters/memory/CoreMemoryAdapter.ts";

// =============================================================================
// Promotion Thresholds
// =============================================================================

export interface PromotionThresholds {
  observationToLongTerm: {
    minCount: number;
    requiresApproval: boolean;
  };
  longTermToCore: {
    minCount: number;
    minDaysInLongTerm: number;
    requiresApproval: boolean;
  };
}

export const DEFAULT_THRESHOLDS: PromotionThresholds = {
  observationToLongTerm: {
    minCount: 2,
    requiresApproval: true,
  },
  longTermToCore: {
    minCount: 3,
    minDaysInLongTerm: 7,
    requiresApproval: true,
  },
};

// =============================================================================
// MemoryItem (extended view combining observation + memory state)
// =============================================================================

export interface MemoryItem {
  id: string;
  text: string;
  count: number;
  sessionRefs: string[];
  firstSeen: Date;
  lastSeen: Date;
  level: "pending" | "long_term" | "core";
  approvedAt?: Date;
  promotedToLongTermAt?: Date;
  promotedToCoreAt?: Date;
  coreMemoryTargets?: ("claude_md" | "agents_md")[];
}

// =============================================================================
// MemoryHierarchy Class
// =============================================================================

export class MemoryHierarchy {
  private readonly observationStore: ObservationStore;
  private readonly memoryStore: MemoryStore;
  private readonly coreMemoryAdapters: CoreMemoryAdapter[];
  private readonly thresholds: PromotionThresholds;

  constructor(options: {
    observationStore: ObservationStore;
    memoryStore: MemoryStore;
    coreMemoryAdapters: CoreMemoryAdapter[];
    thresholds?: PromotionThresholds;
  }) {
    this.observationStore = options.observationStore;
    this.memoryStore = options.memoryStore;
    this.coreMemoryAdapters = options.coreMemoryAdapters;
    this.thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  }

  // ===========================================================================
  // Observation → Long-Term Promotion
  // ===========================================================================

  /**
   * Promote an observation to long-term memory.
   * Validates thresholds and updates both stores.
   */
  async promoteToLongTerm(observationId: string): Promise<{
    success: boolean;
    reason?: string;
    memoryId?: string;
  }> {
    const observation = await this.observationStore.getById(observationId);
    if (!observation) {
      return { success: false, reason: `Observation not found: ${observationId}` };
    }

    // Mark as approved if pending
    if (observation.status === "pending") {
      await this.observationStore.setStatus(observationId, "approved");
    }

    // Validate count threshold
    const validation = this.validateObservationForPromotion(observation);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    // Promote via MemoryStore
    const result = await this.memoryStore.promoteToLongTerm(observationId);
    if (!result.success) {
      return { success: false, reason: result.reason };
    }

    // Update observation status
    await this.observationStore.setStatus(observationId, "promoted-to-long-term");

    return { success: true, memoryId: result.id };
  }

  // ===========================================================================
  // Long-Term → Core Promotion
  // ===========================================================================

  /**
   * Promote a long-term memory to core memory.
   * Writes to configured CoreMemoryAdapters and updates state.
   */
  async promoteToCore(
    memoryId: string,
    targets?: ("claude_md" | "agents_md")[]
  ): Promise<{ success: boolean; reason?: string; writtenTo?: string[] }> {
    const memory = await this.memoryStore.getById(memoryId);
    if (!memory) {
      return { success: false, reason: `Long-term memory not found: ${memoryId}` };
    }

    // Validate thresholds
    const validation = this.validateMemoryForCorePromotion(memory);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    // Determine target adapters
    const resolvedTargets = targets ?? this.getDefaultTargets();
    if (resolvedTargets.length === 0) {
      return { success: false, reason: "No core memory targets configured" };
    }

    // Format content for core memory
    const formattedContent = this.formatForCoreMemory(memory);

    // Write to each target adapter
    const writtenTo: string[] = [];
    const errors: string[] = [];

    for (const target of resolvedTargets) {
      const adapter = this.coreMemoryAdapters.find((a) => {
        if (target === "claude_md") return a.name === "claude-md";
        if (target === "agents_md") return a.name === "agents-md";
        return false;
      });

      if (!adapter) {
        errors.push(`No adapter configured for target: ${target}`);
        continue;
      }

      try {
        await adapter.append(formattedContent);
        writtenTo.push(adapter.getPath());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to write to ${adapter.name}: ${msg}`);
      }
    }

    if (errors.length > 0 && writtenTo.length === 0) {
      return { success: false, reason: errors.join("; ") };
    }

    // Update memory status
    await this.memoryStore.setStatus(memoryId, "scheduled-for-core");

    // Update observation status
    await this.observationStore.setStatus(
      memory.observation.id,
      "promoted-to-core"
    );

    return {
      success: true,
      writtenTo,
      reason: errors.length > 0 ? `Partial success: ${errors.join("; ")}` : undefined,
    };
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get long-term memories that are ready for core promotion.
   */
  async getPromotableToCore(): Promise<LongTermMemory[]> {
    return this.memoryStore.getPromotableToCore();
  }

  /**
   * Get all long-term memories (non-denied, non-core).
   */
  async getLongTermMemories(): Promise<LongTermMemory[]> {
    const all = await this.memoryStore.getAll();
    return all.filter(
      (m) => m.status !== "denied" && m.status !== "scheduled-for-core"
    );
  }

  /**
   * Get a memory by ID.
   */
  async getMemoryById(id: string): Promise<LongTermMemory | null> {
    return this.memoryStore.getById(id);
  }

  /**
   * Get counts at each level.
   */
  async getCounts(): Promise<{
    pending: number;
    longTerm: number;
    core: number;
  }> {
    const pending = await this.observationStore.getPending();
    const memoryCounts = await this.memoryStore.getCounts();
    return {
      pending: pending.length,
      longTerm: memoryCounts.longTerm,
      core: memoryCounts.core,
    };
  }

  // ===========================================================================
  // Deny Operations
  // ===========================================================================

  /**
   * Mark an observation as denied (won't be promoted).
   */
  async denyObservation(observationId: string): Promise<void> {
    await this.observationStore.setStatus(observationId, "denied");
  }

  /**
   * Mark a long-term memory as denied (won't be promoted to core).
   */
  async denyMemory(memoryId: string): Promise<void> {
    await this.memoryStore.setStatus(memoryId, "denied");
  }

  /**
   * Mark promoted memory as rejected for core promotion.
   */
  async markRejected(memoryId: string): Promise<void> {
    await this.memoryStore.setStatus(memoryId, "denied");
  }

  /**
   * Mark memory as promoted (alias for state tracking).
   */
  async markPromoted(memoryId: string): Promise<void> {
    await this.memoryStore.setStatus(memoryId, "scheduled-for-core");
  }

  // ===========================================================================
  // Validation (Private)
  // ===========================================================================

  private validateObservationForPromotion(
    observation: Observation
  ): { valid: boolean; reason?: string } {
    const minCount = this.thresholds.observationToLongTerm.minCount;
    if (observation.count < minCount) {
      return {
        valid: false,
        reason: `Count too low: ${observation.count}/${minCount}`,
      };
    }
    return { valid: true };
  }

  private validateMemoryForCorePromotion(
    memory: LongTermMemory
  ): { valid: boolean; reason?: string } {
    const minCount = this.thresholds.longTermToCore.minCount;
    const minDays = this.thresholds.longTermToCore.minDaysInLongTerm;

    if (memory.observation.count < minCount) {
      return {
        valid: false,
        reason: `Count too low for core promotion: ${memory.observation.count}/${minCount}`,
      };
    }

    const days = this.memoryStore.daysSinceLongTermPromotion(memory);
    if (days < minDays) {
      return {
        valid: false,
        reason: `Not enough time in long-term: ${days}/${minDays} days`,
      };
    }

    return { valid: true };
  }

  // ===========================================================================
  // Helpers (Private)
  // ===========================================================================

  private getDefaultTargets(): ("claude_md" | "agents_md")[] {
    const targets: ("claude_md" | "agents_md")[] = [];
    for (const adapter of this.coreMemoryAdapters) {
      if (adapter.name === "claude-md") targets.push("claude_md");
      if (adapter.name === "agents-md") targets.push("agents_md");
    }
    return targets;
  }

  /**
   * Format a long-term memory as markdown for core memory files.
   */
  formatForCoreMemory(memory: LongTermMemory): string {
    const obs = memory.observation;
    const lines: string[] = [];

    lines.push(`## ${obs.text}`);
    lines.push("");
    lines.push(`- **Count**: ${obs.count}`);
    lines.push(
      `- **First seen**: ${obs.firstSeen.toISOString().split("T")[0]}`
    );
    lines.push(
      `- **Last seen**: ${obs.lastSeen.toISOString().split("T")[0]}`
    );

    if (obs.sourceSessionIds.length > 0) {
      lines.push(`- **Sessions**: ${obs.sourceSessionIds.join(", ")}`);
    }

    if (obs.category) {
      lines.push(`- **Category**: ${obs.category}`);
    }

    lines.push("");
    return lines.join("\n");
  }
}
