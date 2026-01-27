#!/usr/bin/env bun

import type { Clerc } from "clerc";
import { initializeProject } from "../../setup/init.js";

/**
 * Handler for the `sanj init` command.
 *
 * Initializes the Sanj project by:
 * - Creating ~/.sanj directory structure
 * - Generating default config.json
 * - Initializing state.json
 * - Displaying welcome message with next steps
 *
 * This command is idempotent - safe to run multiple times.
 *
 * @param ctx - CLERC context object
 */
export async function initHandler(ctx: Clerc.Context): Promise<void> {
  try {
    console.log("Initializing sanj...\n");

    const result = await initializeProject();

    if (result.success) {
      console.log(result.message);
      process.exit(0);
    } else {
      console.error("✗ Initialization failed:", result.message);
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "✗ Initialization failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
