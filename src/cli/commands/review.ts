/**
 * Review Command Handler
 *
 * Entry point for `sanj review`. Loads pending observations,
 * runs the TUI, and handles results. Approved observations are
 * automatically promoted to long-term memory.
 *
 * @module cli/commands/review
 */

import { ObservationStore } from "../../storage/observation-store.ts";
import { MemoryStore } from "../../storage/memory-store.ts";
import { OBSERVATIONS_PATH } from "../../storage/paths.ts";
import { readConfig } from "../../storage/config.ts";
import { MemoryPromotionService } from "../../services/memory-promotion.ts";
import { runTUI } from "../../tui/index.ts";

/**
 * Handler for `sanj review` command.
 * Loads pending observations and runs the TUI for interactive review.
 */
export async function handleReview(_ctx: unknown): Promise<void> {
  try {
    // Initialize ObservationStore
    const store = new ObservationStore(OBSERVATIONS_PATH);
    await store.load();

    // Get pending observations
    const pending = await store.getPending();

    if (pending.length === 0) {
      console.log("No observations pending review.");
      console.log('Run "sanj analyze" first to extract observations from sessions.');
      process.exit(0);
    }

    console.log(`Found ${pending.length} pending observation(s).`);
    console.log("Launching review TUI...\n");

    // Run TUI directly
    const results = await runTUI(pending);

    // Apply results to ObservationStore
    if (results.approvedObservations?.length > 0) {
      for (const id of results.approvedObservations) {
        await store.setStatus(id, "approved");
      }
    }

    if (results.deniedObservations?.length > 0) {
      for (const id of results.deniedObservations) {
        await store.setStatus(id, "denied");
      }
    }

    // Save updated observations
    await store.save();

    // Promote approved observations to long-term memory
    const approved = results.approvedObservations?.length ?? 0;
    const denied = results.deniedObservations?.length ?? 0;
    const skipped = results.skippedObservations?.length ?? 0;
    let promoted = 0;

    if (approved > 0) {
      const config = await readConfig();
      const memoryStore = new MemoryStore(undefined, store);
      await memoryStore.load();

      const promotionService = new MemoryPromotionService(store, memoryStore, config);
      const promotionResult = await promotionService.checkAndPromoteObservations();
      promoted = promotionResult.promoted;

      // Save memory store with promoted memories
      await memoryStore.save();
      // Save observation store with updated statuses (promoted-to-long-term)
      await store.save();
    }

    // Show summary
    console.log("\nReview complete:");
    console.log(`  Approved: ${approved}`);
    if (promoted > 0) {
      console.log(`  Promoted to long-term memory: ${promoted}`);
    }
    console.log(`  Denied:   ${denied}`);
    console.log(`  Skipped:  ${skipped}`);

    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}
