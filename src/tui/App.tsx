/**
 * App.tsx — Root TUI component for the observation review interface.
 *
 * Layout:
 * ╭─────────────────────────────────────────────────────────────────────────────╮
 * │                                                                             │
 * │   sanj          5 to review     ✓ 2     ✗ 1     → 0                   1/5   │
 * │                                                                             │
 * ╰─────────────────────────────────────────────────────────────────────────────╯
 *
 *  ┃ [5×] User prefers functional programming over imperative style
 *  ┃      pattern · Jan 15 → Jan 28 · seen in 3 sessions
 *
 *    [3×] Always runs tests before committing changes
 *         workflow · Jan 20 → Jan 27 · seen in 2 sessions
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  A approve   D deny   S skip   U undo(2)  │  j/k navigate   gg/G jump   Q quit
 */

import { useState, useEffect, useCallback } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { Header } from "./components/Header.tsx";
import { ObservationList } from "./components/ObservationList.tsx";
import { StatusLine } from "./components/StatusLine.tsx";
import { QuitDialog } from "./components/QuitDialog.tsx";
import type { Observation } from "../core/types.ts";
import type { ReviewResults } from "./index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UndoAction {
  type: "approve" | "deny";
  observation: Observation;
  previousIndex: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AppProps {
  observations?: Observation[];
  onResults?: (results: ReviewResults) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function App({
  observations: initialObservations = [],
  onResults,
}: AppProps) {
  const renderer = useRenderer();
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();

  // State
  const [observations, setObservations] = useState<Observation[]>(initialObservations);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [approved, setApproved] = useState<string[]>([]);
  const [denied, setDenied] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [gPending, setGPending] = useState(false);

  // Dialog state
  const [showQuitDialog, setShowQuitDialog] = useState(false);

  // Sync observations if parent updates them
  useEffect(() => {
    setObservations(initialObservations);
    setSelectedIndex(0);
  }, [initialObservations]);

  // Clamp selectedIndex when observations change
  useEffect(() => {
    if (observations.length > 0 && selectedIndex >= observations.length) {
      setSelectedIndex(observations.length - 1);
    }
  }, [observations.length, selectedIndex]);

  // Clear g pending after timeout
  useEffect(() => {
    if (!gPending) return;
    const timeout = setTimeout(() => setGPending(false), 500);
    return () => clearTimeout(timeout);
  }, [gPending]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleApprove = useCallback((autoAdvance = false) => {
    if (observations.length === 0 || selectedIndex >= observations.length) return;

    const obs = observations[selectedIndex];
    if (!obs) return;

    // Push to undo stack
    setUndoStack((prev) => [...prev.slice(-9), { type: "approve", observation: obs, previousIndex: selectedIndex }]);

    // Update state
    setApproved((prev) => [...prev, obs.id]);
    setObservations((prev) => prev.filter((o) => o.id !== obs.id));

    // Adjust selection
    if (!autoAdvance) {
      setSelectedIndex((prev) =>
        prev >= observations.length - 1 ? Math.max(0, observations.length - 2) : prev
      );
    }
  }, [observations, selectedIndex]);

  const handleDeny = useCallback((autoAdvance = false) => {
    if (observations.length === 0 || selectedIndex >= observations.length) return;

    const obs = observations[selectedIndex];
    if (!obs) return;

    // Push to undo stack
    setUndoStack((prev) => [...prev.slice(-9), { type: "deny", observation: obs, previousIndex: selectedIndex }]);

    // Update state
    setDenied((prev) => [...prev, obs.id]);
    setObservations((prev) => prev.filter((o) => o.id !== obs.id));

    // Adjust selection
    if (!autoAdvance) {
      setSelectedIndex((prev) =>
        prev >= observations.length - 1 ? Math.max(0, observations.length - 2) : prev
      );
    }
  }, [observations, selectedIndex]);

  const handleSkip = useCallback((autoAdvance = false) => {
    if (observations.length === 0 || selectedIndex >= observations.length) return;

    const obs = observations[selectedIndex];
    if (!obs) return;

    // Track skipped (doesn't remove from list)
    setSkipped((prev) => (prev.includes(obs.id) ? prev : [...prev, obs.id]));

    // Move to next item
    if (autoAdvance || selectedIndex < observations.length - 1) {
      setSelectedIndex((prev) => Math.min(prev + 1, observations.length - 1));
    }
  }, [observations, selectedIndex]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    if (!action) return;

    setUndoStack((prev) => prev.slice(0, -1));

    // Restore observation
    setObservations((prev) => {
      const newObs = [...prev];
      const insertIndex = Math.min(action.previousIndex, newObs.length);
      newObs.splice(insertIndex, 0, action.observation);
      return newObs;
    });

    // Remove from approved/denied
    if (action.type === "approve") {
      setApproved((prev) => prev.filter((id) => id !== action.observation.id));
    } else {
      setDenied((prev) => prev.filter((id) => id !== action.observation.id));
    }

    // Restore selection
    setSelectedIndex(action.previousIndex);
  }, [undoStack]);

  const exitTUI = useCallback((save: boolean) => {
    if (save && onResults) {
      onResults({
        approvedObservations: approved,
        deniedObservations: denied,
        skippedObservations: skipped,
      });
    }
    renderer.destroy();
  }, [onResults, approved, denied, skipped, renderer]);

  // Show quit dialog if there are changes
  const handleQuitRequest = useCallback(() => {
    const hasChanges = approved.length > 0 || denied.length > 0;
    if (hasChanges) {
      setShowQuitDialog(true);
    } else {
      exitTUI(false);
    }
  }, [approved.length, denied.length, exitTUI]);

  // Quit dialog handlers
  const handleQuitSave = useCallback(() => {
    setShowQuitDialog(false);
    exitTUI(true);
  }, [exitTUI]);

  const handleQuitDiscard = useCallback(() => {
    setShowQuitDialog(false);
    exitTUI(false);
  }, [exitTUI]);

  const handleQuitCancel = useCallback(() => {
    setShowQuitDialog(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(observations.length - 1, prev + 1));
  }, [observations.length]);

  const jumpToTop = useCallback(() => {
    setSelectedIndex(0);
  }, []);

  const jumpToBottom = useCallback(() => {
    setSelectedIndex(Math.max(0, observations.length - 1));
  }, [observations.length]);

  const pageUp = useCallback(() => {
    const pageSize = Math.floor(terminalHeight / 6); // ~half page
    setSelectedIndex((prev) => Math.max(0, prev - pageSize));
  }, [terminalHeight]);

  const pageDown = useCallback(() => {
    const pageSize = Math.floor(terminalHeight / 6);
    setSelectedIndex((prev) => Math.min(observations.length - 1, prev + pageSize));
  }, [observations.length, terminalHeight]);

  // ---------------------------------------------------------------------------
  // Keyboard Handler
  // ---------------------------------------------------------------------------

  useKeyboard((key) => {
    // Don't handle keys when quit dialog is open (it handles its own keys)
    if (showQuitDialog) return;

    // Handle gg sequence
    if (gPending) {
      setGPending(false);
      if (key.name === "g") {
        jumpToTop();
        return;
      }
      // If not g, fall through to normal handling
    }

    // Check for g press (start of gg sequence)
    if (key.name === "g" && !key.shift && !key.ctrl) {
      setGPending(true);
      return;
    }

    // Navigation
    switch (key.name) {
      case "j":
      case "down":
        moveDown();
        return;
      case "k":
      case "up":
        moveUp();
        return;
      case "home":
        jumpToTop();
        return;
      case "end":
        jumpToBottom();
        return;
      case "pageup":
        pageUp();
        return;
      case "pagedown":
        pageDown();
        return;
    }

    // G (shift+g) for jump to bottom
    if (key.name === "g" && key.shift) {
      jumpToBottom();
      return;
    }

    // Ctrl+d/u for half-page
    if (key.ctrl) {
      if (key.name === "d") {
        pageDown();
        return;
      }
      if (key.name === "u") {
        pageUp();
        return;
      }
      if (key.name === "z") {
        handleUndo();
        return;
      }
    }

    // Prevent action repeat
    if (key.eventType === "repeat") return;

    // Actions (check shift for auto-advance)
    switch (key.name) {
      case "a":
        handleApprove(key.shift);
        return;
      case "d":
        handleDeny(key.shift);
        return;
      case "s":
      case "space":
        handleSkip(key.shift);
        return;
      case "u":
        handleUndo();
        return;
      case "return":
        handleApprove(false);
        return;
      case "backspace":
        handleDeny(false);
        return;
      case "q":
        handleQuitRequest();
        return;
    }
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Calculate viewport height for list (total - header - status)
  const headerHeight = 5; // Border + padding + content
  const statusHeight = 2;
  const listViewportHeight = Math.max(6, terminalHeight - headerHeight - statusHeight - 2);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Header
        pendingCount={observations.length}
        approvedCount={approved.length}
        deniedCount={denied.length}
        skippedCount={skipped.length}
        currentIndex={selectedIndex}
        totalCount={observations.length}
      />

      {/* Content area */}
      <box flexDirection="column" flexGrow={1} width="100%">
        <ObservationList
          observations={observations}
          selectedIndex={selectedIndex}
          approvedCount={approved.length}
          deniedCount={denied.length}
          skippedCount={skipped.length}
          viewportHeight={listViewportHeight}
        />
      </box>

      {/* Status line */}
      <StatusLine
        undoDepth={undoStack.length}
        disabled={observations.length === 0}
        terminalWidth={terminalWidth}
        gPending={gPending}
      />

      {/* Quit confirmation dialog */}
      {showQuitDialog && (
        <QuitDialog
          approvedCount={approved.length}
          deniedCount={denied.length}
          onSave={handleQuitSave}
          onDiscard={handleQuitDiscard}
          onCancel={handleQuitCancel}
        />
      )}
    </box>
  );
}

export default App;
