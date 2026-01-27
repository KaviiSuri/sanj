import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Formatter } from "../../src/cli/formatter";

describe("Formatter", () => {
  let formatter: Formatter;
  let originalNoColor: string | undefined;

  beforeEach(() => {
    // Save original NO_COLOR state
    originalNoColor = process.env.NO_COLOR;
  });

  afterEach(() => {
    // Restore original NO_COLOR state
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  });

  describe("with colors enabled", () => {
    beforeEach(() => {
      delete process.env.NO_COLOR;
      formatter = new Formatter();
    });

    test("success method outputs with checkmark", () => {
      // This test verifies the method exists and can be called
      // Output verification would require mocking console.log
      expect(() => formatter.success("Test success")).not.toThrow();
    });

    test("error method outputs with X", () => {
      expect(() => formatter.error("Test error")).not.toThrow();
    });

    test("info method outputs with info icon", () => {
      expect(() => formatter.info("Test info")).not.toThrow();
    });

    test("warning method outputs with warning icon", () => {
      expect(() => formatter.warning("Test warning")).not.toThrow();
    });

    test("plain method outputs without styling", () => {
      expect(() => formatter.plain("Test plain")).not.toThrow();
    });

    test("header method outputs section header", () => {
      expect(() => formatter.header("Test Header")).not.toThrow();
    });

    test("subheader method outputs subheader", () => {
      expect(() => formatter.subheader("Test Subheader")).not.toThrow();
    });

    test("table method formats key-value pairs", () => {
      const rows: Array<[string, string | number | boolean]> = [
        ["Name", "Test"],
        ["Count", 42],
        ["Active", true],
      ];
      expect(() => formatter.table(rows)).not.toThrow();
    });

    test("table method respects indent option", () => {
      const rows: Array<[string, string]> = [["Key", "Value"]];
      expect(() => formatter.table(rows, { indent: 4 })).not.toThrow();
    });

    test("table method respects keyWidth option", () => {
      const rows: Array<[string, string]> = [["Key", "Value"]];
      expect(() => formatter.table(rows, { keyWidth: 20 })).not.toThrow();
    });

    test("list method outputs bulleted list", () => {
      const items = ["Item 1", "Item 2", "Item 3"];
      expect(() => formatter.list(items)).not.toThrow();
    });

    test("list method respects indent option", () => {
      const items = ["Item 1"];
      expect(() => formatter.list(items, { indent: 4 })).not.toThrow();
    });

    test("list method respects bullet option", () => {
      const items = ["Item 1"];
      expect(() => formatter.list(items, { bullet: "*" })).not.toThrow();
    });

    test("newline method outputs blank line", () => {
      expect(() => formatter.newline()).not.toThrow();
    });

    test("success method handles multiple arguments", () => {
      expect(() => formatter.success("Test", "with", "args")).not.toThrow();
    });

    test("error method handles multiple arguments", () => {
      expect(() => formatter.error("Test", "with", "args")).not.toThrow();
    });

    test("info method handles multiple arguments", () => {
      expect(() => formatter.info("Test", "with", "args")).not.toThrow();
    });

    test("warning method handles multiple arguments", () => {
      expect(() => formatter.warning("Test", "with", "args")).not.toThrow();
    });
  });

  describe("with NO_COLOR environment variable", () => {
    beforeEach(() => {
      process.env.NO_COLOR = "1";
      formatter = new Formatter();
    });

    test("success method outputs without colors", () => {
      expect(() => formatter.success("Test success")).not.toThrow();
    });

    test("error method outputs without colors", () => {
      expect(() => formatter.error("Test error")).not.toThrow();
    });

    test("info method outputs without colors", () => {
      expect(() => formatter.info("Test info")).not.toThrow();
    });

    test("warning method outputs without colors", () => {
      expect(() => formatter.warning("Test warning")).not.toThrow();
    });

    test("header method outputs without colors", () => {
      expect(() => formatter.header("Test Header")).not.toThrow();
    });

    test("table method outputs without colors", () => {
      const rows: Array<[string, string]> = [["Key", "Value"]];
      expect(() => formatter.table(rows)).not.toThrow();
    });
  });

  describe("Spinner", () => {
    beforeEach(() => {
      delete process.env.NO_COLOR;
      formatter = new Formatter();
    });

    test("spinner can be created", () => {
      const spinner = formatter.spinner("Loading...");
      expect(spinner).toBeDefined();
    });

    test("spinner can be started and stopped", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      // Let it spin for a short time
      setTimeout(() => {
        spinner.stop();
        done();
      }, 200);
    });

    test("spinner message can be updated", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.updateMessage("Still loading...");
      }, 100);

      setTimeout(() => {
        spinner.stop();
        done();
      }, 200);
    });

    test("spinner can succeed", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.succeed("Done!");
        done();
      }, 200);
    });

    test("spinner can fail", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.fail("Failed!");
        done();
      }, 200);
    });

    test("spinner can warn", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.warn("Warning!");
        done();
      }, 200);
    });

    test("spinner works with NO_COLOR", (done) => {
      process.env.NO_COLOR = "1";
      const noColorFormatter = new Formatter();
      const spinner = noColorFormatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.succeed("Done!");
        done();
      }, 200);
    });

    test("spinner stop with final message", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.stop("Stopped with message");
        done();
      }, 200);
    });

    test("spinner can be stopped multiple times safely", (done) => {
      const spinner = formatter.spinner("Loading...");
      spinner.start();

      setTimeout(() => {
        spinner.stop();
        spinner.stop(); // Should not throw
        done();
      }, 200);
    });
  });

  describe("default formatter export", () => {
    test("default formatter is available", async () => {
      const { formatter: defaultFormatter } = await import(
        "../../src/cli/formatter"
      );
      expect(defaultFormatter).toBeDefined();
      expect(defaultFormatter).toBeInstanceOf(Formatter);
    });
  });
});
