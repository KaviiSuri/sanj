/**
 * Review Command Handler
 *
 * Entry point for `sanj review`. Loads pending observations,
 * runs the TUI, and handles results.
 *
 * @module cli/commands/review
 */

import { ObservationStore } from "../../storage/observation-store.ts";
import { OBSERVATIONS_PATH } from "../../storage/paths.ts";
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

    // Show summary
    const approved = results.approvedObservations?.length ?? 0;
    const denied = results.deniedObservations?.length ?? 0;
    const skipped = results.skippedObservations?.length ?? 0;

    console.log("\nReview complete:");
    console.log(`  Approved: ${approved}`);
    console.log(`  Denied:   ${denied}`);
    console.log(`  Skipped:  ${skipped}`);

    process.exit(0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}
