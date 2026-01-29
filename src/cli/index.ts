#!/usr/bin/env bun
import { Cli, notFoundPlugin, friendlyErrorPlugin } from "clerc";
import pkg from "../../package.json" assert { type: "json" };
import { initHandler } from "./commands/init.js";
import { configHandler } from "./commands/config.js";

/**
 * Main CLI entry point for Sanj
 *
 * This file sets up the CLERC-based CLI with all available commands.
 * Commands are registered here and route to their respective handlers.
 *
 * Plugins:
 * - Cli() includes helpPlugin() and versionPlugin() by default
 * - notFoundPlugin: Shows "Did you mean X?" for typos
 * - friendlyErrorPlugin: Shows friendly errors instead of stack traces
 */

// Create and configure the CLI application
Cli()
  .scriptName("sanj")
  .version(pkg.version)
  .use(notFoundPlugin())
  .use(friendlyErrorPlugin())

  // Command: init - Initialize Sanj with default settings
  .command("init", "Initialize sanj with default settings")
  .on("init", initHandler)

  // Command: analyze - Analyze recent coding sessions
  .command("analyze", "Analyze recent coding sessions", {
    flags: {
      limit: {
        type: Number,
        description: "Limit number of sessions to process",
        alias: "l",
      },
      verbose: {
        type: Boolean,
        description: "Show verbose output",
        alias: "v",
      },
    },
  })
  .on("analyze", async (ctx: any) => {
    const { handleAnalyze } = await import('./commands/analyze.ts');
    await handleAnalyze(ctx.flags);
  })

  // Command: review - Review and approve pending observations
  .command("review", "Review and approve pending observations")
  .on("review", async (ctx: any) => {
    const { handleReview } = await import('./commands/review.ts');
    await handleReview(ctx);
  })

  // Command: status - Show current state and pending items
  .command("status", "Show current state and pending items")
  .on("status", async (ctx: any) => {
    const { handleStatus } = await import('./commands/status.ts');
    await handleStatus(ctx);
  })

  // Command: doctor - Run health check diagnostics
  .command("doctor", "Run health check diagnostics")
  .on("doctor", async (ctx: any) => {
    const { handleDoctor } = await import('./commands/doctor.ts');
    await handleDoctor(ctx);
  })

  // Command: config - View or edit configuration settings
  .command("config", "View or edit configuration settings")
  .on("config", configHandler)

  // Command: automate - Manage automated analysis scheduling
  .command("automate", "Manage automated analysis scheduling")
  .on("automate", async (ctx: any) => {
    const { handleAutomate } = await import('./commands/automate.ts');
    await handleAutomate(ctx);
  })

  // Parse command-line arguments
  .parse();
