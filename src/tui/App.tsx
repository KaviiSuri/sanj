/**
 * App.tsx — Root TUI component for the observation review interface.
 *
 * Responsibilities:
 * - Initializes OpenTUI rendering environment
 * - Manages global state (observations, selected index, current mode)
 * - Handles keyboard input (q to quit, Tab to switch views, arrow keys, action keys)
 * - Renders header, content (ObservationList), action bar, and footer
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │  Sanj Review - Observations (5)     │  ← Header
 * ├─────────────────────────────────────┤
 * │  [ObservationList renders here]     │  ← Content
 * ├─────────────────────────────────────┤
 * │  [a] Approve  [d] Deny  [s] Skip   │  ← ActionBar
 * ├─────────────────────────────────────┤
 * │  ↑/↓: navigate | Enter: select     │  ← Footer
 * │  Tab: switch view | q: quit        │
 * └─────────────────────────────────────┘
 */

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text } from "@opentui/react";
import { ObservationList } from "./components/ObservationList.tsx";
import { ActionBar } from "./components/ActionBar.tsx";
import type { Observation } from "../core/types.ts";
import type { ReviewResults } from "./index.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AppProps {
  /** Array of pending observations to review */
  observations?: Observation[];
  /** Callback invoked when user exits the TUI */
  onResults?: (results: ReviewResults) => void;
  /** Callback invoked when user presses 'q' */
  onExit?: () => void;
  /** Initial mode */
  mode?: "observations" | "promotions";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function App({
  observations: initialObservations = [],
  onResults,
  onExit,
  mode: initialMode = "observations",
}: AppProps) {
  const [observations, setObservations] =
    useState<Observation[]>(initialObservations);
  const [currentMode, setCurrentMode] = useState(initialMode);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedSection, setFocusedSection] = useState<"list" | "actionbar">(
    "list"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);
  const [denied, setDenied] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [isDenying, setIsDenying] = useState(false);

  // Sync observations if parent updates them (e.g. after initial load)
  useEffect(() => {
    setObservations(initialObservations);
    setSelectedIndex(0);
  }, [initialObservations]);

  // Clamp selectedIndex when observations change
  useEffect(() => {
    if (observations.length > 0 && selectedIndex >= observations.length) {
      setSelectedIndex(observations.length - 1);
    }
  }, [observations, selectedIndex]);

  const handleApprove = useCallback(() => {
    if (observations.length === 0 || selectedIndex >= observations.length)
      return;
    const obs = observations[selectedIndex]!;
    if (!obs) return;
    setIsApproving(true);
    // Simulate brief processing delay
    setTimeout(() => {
      setApproved((prev) => [...prev, obs.id]);
      setObservations((prev) => prev.filter((o) => o.id !== obs.id));
      setSelectedIndex((prev) =>
        prev >= observations.length - 1
          ? Math.max(0, observations.length - 2)
          : prev
      );
      setIsApproving(false);
      setFocusedSection("list");
    }, 50);
  }, [observations, selectedIndex]);

  const handleDeny = useCallback(() => {
    if (observations.length === 0 || selectedIndex >= observations.length)
      return;
    const obs = observations[selectedIndex]!;
    if (!obs) return;
    setIsDenying(true);
    setTimeout(() => {
      setDenied((prev) => [...prev, obs.id]);
      setObservations((prev) => prev.filter((o) => o.id !== obs.id));
      setSelectedIndex((prev) =>
        prev >= observations.length - 1
          ? Math.max(0, observations.length - 2)
          : prev
      );
      setIsDenying(false);
      setFocusedSection("list");
    }, 50);
  }, [observations, selectedIndex]);

  const handleSkip = useCallback(() => {
    if (observations.length === 0 || selectedIndex >= observations.length)
      return;
    const obs = observations[selectedIndex]!;
    if (!obs) return;
    setSkipped((prev) => [...prev, obs.id]);
    // Move to next item without removing
    setSelectedIndex((prev) =>
      prev < observations.length - 1 ? prev + 1 : prev
    );
    setFocusedSection("list");
  }, [observations, selectedIndex]);

  const exitTUI = useCallback(() => {
    if (onResults) {
      onResults({
        approvedObservations: approved,
        deniedObservations: denied,
        skippedObservations: skipped,
      });
    }
    if (onExit) {
      onExit();
    }
  }, [onResults, onExit, approved, denied, skipped]);

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (event: { key: string }) => {
      const key = event.key;

      // Global shortcuts
      if (key === "q" || key === "Q") {
        exitTUI();
        return;
      }

      if (key === "Tab") {
        setCurrentMode((prev) =>
          prev === "observations" ? "promotions" : "observations"
        );
        return;
      }

      // Section-specific shortcuts
      if (focusedSection === "list") {
        if (key === "ArrowUp") {
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        } else if (key === "ArrowDown") {
          setSelectedIndex((prev) =>
            Math.min(observations.length - 1, prev + 1)
          );
        } else if (key === "Enter") {
          setFocusedSection("actionbar");
        } else if (key === "a" || key === "A") {
          handleApprove();
        } else if (key === "d" || key === "D") {
          handleDeny();
        } else if (key === "s" || key === "S") {
          handleSkip();
        }
      } else if (focusedSection === "actionbar") {
        if (key === "a" || key === "A" || key === "Enter") {
          handleApprove();
        } else if (key === "d" || key === "D") {
          handleDeny();
        } else if (key === "s" || key === "S") {
          handleSkip();
        } else if (key === "Escape" || key === "ArrowUp" || key === "ArrowDown") {
          setFocusedSection("list");
        }
      }
    };

    // OpenTUI dispatches key events on the process
    process.on("keydown", handleKeyDown as () => void);
    return () => {
      process.removeListener("keydown", handleKeyDown as () => void);
    };
  }, [
    focusedSection,
    observations,
    selectedIndex,
    handleApprove,
    handleDeny,
    handleSkip,
    exitTUI,
  ]);

  const pendingCount = observations.length;
  const modeLabel = currentMode === "observations" ? "Observations" : "Promotions";

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box
        borderStyle="single"
        borderBottom
        paddingX={1}
        width="100%"
      >
        <Text bold color="cyan">
          {`Sanj Review — ${modeLabel} (${pendingCount} pending)`}
        </Text>
      </Box>

      {/* Content area */}
      <Box flexDirection="column" flexGrow={1} width="100%">
        {isLoading ? (
          <Box paddingX={2} paddingY={1}>
            <Text color="gray">Loading observations...</Text>
          </Box>
        ) : (
          <ObservationList
            observations={observations}
            selectedIndex={selectedIndex}
            onSelectionChange={setSelectedIndex}
            onApprove={handleApprove}
            onDeny={handleDeny}
            onSkip={handleSkip}
            emptyMessage={`No ${currentMode} pending. Press q to quit.`}
          />
        )}
      </Box>

      {/* Action Bar */}
      <ActionBar
        onApprove={handleApprove}
        onDeny={handleDeny}
        onSkip={handleSkip}
        disabled={observations.length === 0}
        isApproving={isApproving}
        isDenying={isDenying}
        isFocused={focusedSection === "actionbar"}
      />

      {/* Footer */}
      <Box
        borderStyle="single"
        borderTop
        paddingX={1}
        width="100%"
      >
        <Text color="gray" dim>
          {"↑/↓: navigate | Enter: select action | Tab: switch view | q: quit"}
        </Text>
      </Box>
    </Box>
  );
}

export default App;
