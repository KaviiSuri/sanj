import chalk from "chalk";

/**
 * Formatter class for consistent CLI output formatting
 * Provides methods for colored output, tables, and progress indicators
 */
export class Formatter {
  private noColor: boolean;

  constructor() {
    // Respect NO_COLOR environment variable
    this.noColor = process.env.NO_COLOR !== undefined;
  }

  /**
   * Display a success message with green checkmark
   */
  success(message: string, ...args: unknown[]): void {
    const icon = "✓";
    const formattedMessage = this.formatMessage(message, args);
    if (this.noColor) {
      console.log(`${icon} ${formattedMessage}`);
    } else {
      console.log(chalk.green(`${icon} ${formattedMessage}`));
    }
  }

  /**
   * Display an error message with red X
   */
  error(message: string, ...args: unknown[]): void {
    const icon = "✗";
    const formattedMessage = this.formatMessage(message, args);
    if (this.noColor) {
      console.error(`${icon} ${formattedMessage}`);
    } else {
      console.error(chalk.red(`${icon} ${formattedMessage}`));
    }
  }

  /**
   * Display an info message with blue indicator
   */
  info(message: string, ...args: unknown[]): void {
    const icon = "ℹ";
    const formattedMessage = this.formatMessage(message, args);
    if (this.noColor) {
      console.log(`${icon} ${formattedMessage}`);
    } else {
      console.log(chalk.blue(`${icon} ${formattedMessage}`));
    }
  }

  /**
   * Display a warning message with yellow indicator
   */
  warning(message: string, ...args: unknown[]): void {
    const icon = "⚠";
    const formattedMessage = this.formatMessage(message, args);
    if (this.noColor) {
      console.log(`${icon} ${formattedMessage}`);
    } else {
      console.log(chalk.yellow(`${icon} ${formattedMessage}`));
    }
  }

  /**
   * Display plain text without styling
   */
  plain(message: string, ...args: unknown[]): void {
    const formattedMessage = this.formatMessage(message, args);
    console.log(formattedMessage);
  }

  /**
   * Display a section header
   */
  header(message: string): void {
    if (this.noColor) {
      console.log(`\n${message}`);
      console.log("=".repeat(message.length));
    } else {
      console.log(chalk.bold.cyan(`\n${message}`));
      console.log(chalk.cyan("=".repeat(message.length)));
    }
  }

  /**
   * Display a subheader
   */
  subheader(message: string): void {
    if (this.noColor) {
      console.log(`\n${message}`);
    } else {
      console.log(chalk.bold(`\n${message}`));
    }
  }

  /**
   * Format and display a table
   * @param rows Array of row arrays [key, value] pairs
   * @param options Table formatting options
   */
  table(
    rows: Array<[string, string | number | boolean]>,
    options: { indent?: number; keyWidth?: number } = {}
  ): void {
    const indent = " ".repeat(options.indent ?? 2);
    const keyWidth = options.keyWidth ?? Math.max(...rows.map(([k]) => k.length));

    rows.forEach(([key, value]) => {
      const paddedKey = key.padEnd(keyWidth);
      const formattedValue = String(value);

      if (this.noColor) {
        console.log(`${indent}${paddedKey}: ${formattedValue}`);
      } else {
        console.log(`${indent}${chalk.dim(paddedKey)}: ${formattedValue}`);
      }
    });
  }

  /**
   * Display a list with bullets
   */
  list(items: string[], options: { indent?: number; bullet?: string } = {}): void {
    const indent = " ".repeat(options.indent ?? 2);
    const bullet = options.bullet ?? "-";

    items.forEach((item) => {
      console.log(`${indent}${bullet} ${item}`);
    });
  }

  /**
   * Create a spinner for long-running operations
   */
  spinner(message: string): Spinner {
    return new Spinner(message, this.noColor);
  }

  /**
   * Display a blank line
   */
  newline(): void {
    console.log();
  }

  /**
   * Format a message with arguments
   */
  private formatMessage(message: string, args: unknown[]): string {
    if (args.length === 0) {
      return message;
    }
    return `${message} ${args.map(String).join(" ")}`;
  }
}

/**
 * Spinner class for displaying progress indicators
 */
class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;
  private interval: Timer | null = null;
  private message: string;
  private noColor: boolean;

  constructor(message: string, noColor: boolean) {
    this.message = message;
    this.noColor = noColor;
  }

  /**
   * Start the spinner animation
   */
  start(): void {
    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;

      if (this.noColor) {
        process.stdout.write(`\r${frame} ${this.message}`);
      } else {
        process.stdout.write(`\r${chalk.cyan(frame)} ${this.message}`);
      }
    }, 80);
  }

  /**
   * Update the spinner message
   */
  updateMessage(message: string): void {
    this.message = message;
  }

  /**
   * Stop the spinner and clear the line
   */
  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear the line
    process.stdout.write("\r" + " ".repeat(this.message.length + 3) + "\r");

    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  /**
   * Stop the spinner with a success message
   */
  succeed(message?: string): void {
    const msg = message ?? this.message;
    this.stop();
    if (this.noColor) {
      console.log(`✓ ${msg}`);
    } else {
      console.log(chalk.green(`✓ ${msg}`));
    }
  }

  /**
   * Stop the spinner with a failure message
   */
  fail(message?: string): void {
    const msg = message ?? this.message;
    this.stop();
    if (this.noColor) {
      console.log(`✗ ${msg}`);
    } else {
      console.log(chalk.red(`✗ ${msg}`));
    }
  }

  /**
   * Stop the spinner with a warning message
   */
  warn(message?: string): void {
    const msg = message ?? this.message;
    this.stop();
    if (this.noColor) {
      console.log(`⚠ ${msg}`);
    } else {
      console.log(chalk.yellow(`⚠ ${msg}`));
    }
  }
}

/**
 * Default formatter instance for convenient usage
 */
export const formatter = new Formatter();
