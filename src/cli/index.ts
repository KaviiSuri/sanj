#!/usr/bin/env bun
import { Cli } from "clerc";
import pkg from "../../package.json" assert { type: "json" };
import { initHandler } from "./commands/init.js";
import { configHandler } from "./commands/config.js";

/**
 * Main CLI entry point for Sanj
 *
 * This file sets up the CLERC-based CLI with all available commands.
 * Commands are registered here and route to their respective handlers.
 *
 * Note: Cli() automatically includes helpPlugin() and versionPlugin().
 * Help is available via: sanj --help, sanj -h, or sanj help
 * Version is available via: sanj --version, sanj -v
 */

// Create and configure the CLI application
Cli()
  .scriptName("sanj")
  .version(pkg.version)

  // Command: init - Initialize Sanj with default settings
  .command("init", "Initialize sanj with default settings")
  .on("init", initHandler)

  // Command: analyze - Analyze recent coding sessions
  .command("analyze", "Analyze recent coding sessions")
  .on("analyze", (ctx) => {
    console.log("sanj analyze - Not yet implemented");
    console.log("This command will analyze Claude Code sessions and extract patterns.");
  })

  // Command: review - Review and approve pending observations
  .command("review", "Review and approve pending observations")
  .on("review", (ctx) => {
    console.log("sanj review - Not yet implemented");
    console.log("This command will launch the TUI for reviewing observations.");
  })

  // Command: status - Show current state and pending items
  .command("status", "Show current state and pending items")
  .on("status", (ctx) => {
    console.log("sanj status - Not yet implemented");
    console.log("This command will display the current status and statistics.");
  })

  // Command: config - View or edit configuration settings
  .command("config", "View or edit configuration settings")
  .on("config", configHandler)

  // Command: cron - Manage scheduled automation
  .command("cron", "Manage scheduled automation")
  .on("cron", (ctx) => {
    console.log("sanj cron - Not yet implemented");
    console.log("This command will manage scheduled analysis automation.");
  })

  // Parse command-line arguments
  .parse();
