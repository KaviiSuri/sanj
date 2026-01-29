/**
 * ObservationList — Virtualized list of observations with scroll indicators.
 *
 * Layout (when scrolled):
 *   (3 more above)
 *
 *    [2×] Uses Bun instead of npm for package management
 *         tool-choice · Jan 22 → Jan 25 · seen in 2 sessions
 *
 *  ┃ [2×] Prefers explicit error handling over try-catch blocks
 *  ┃      style · Jan 24 → Jan 28 · seen in 1 session
 *
 *    [1×] Uses vim keybindings in all editors
 *         preference · Jan 28 · seen in 1 session
 *
 *   (5 more below)
 */

import { ObservationItem } from "./ObservationItem.tsx";
import { EmptyState } from "./EmptyState.tsx";
import type { Observation } from "../../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ObservationListProps {
  observations: Observation[];
  selectedIndex: number;
  approvedCount?: number;
  deniedCount?: number;
  skippedCount?: number;
  viewportHeight?: number;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getViewportWindow(
  selectedIndex: number,
  totalCount: number,
  visibleCount: number
): { startIndex: number; endIndex: number } {
  if (totalCount <= visibleCount) {
    return { startIndex: 0, endIndex: totalCount };
  }

  // Keep selected item roughly centered
  const halfVisible = Math.floor(visibleCount / 2);
  let startIndex = Math.max(0, selectedIndex - halfVisible);
  let endIndex = Math.min(totalCount, startIndex + visibleCount);

  // Adjust if we hit the bottom
  if (endIndex === totalCount) {
    startIndex = Math.max(0, totalCount - visibleCount);
  }

  return { startIndex, endIndex };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ObservationList({
  observations,
  selectedIndex,
  approvedCount = 0,
  deniedCount = 0,
  skippedCount = 0,
  viewportHeight = 15,
  isLoading = false,
}: ObservationListProps) {
  // Loading state
  if (isLoading) {
    return (
      <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
        <text>
          <span fg="#808080">Loading observations...</span>
        </text>
      </box>
    );
  }

  // Empty state
  if (observations.length === 0) {
    return (
      <EmptyState
        approvedCount={approvedCount}
        deniedCount={deniedCount}
        skippedCount={skippedCount}
      />
    );
  }

  // Calculate visible items (each item is ~3 lines: 2 content + 1 margin)
  const itemHeight = 3;
  const visibleCount = Math.max(1, Math.floor(viewportHeight / itemHeight));

  const { startIndex, endIndex } = getViewportWindow(
    selectedIndex,
    observations.length,
    visibleCount
  );

  const itemsAbove = startIndex;
  const itemsBelow = observations.length - endIndex;

  return (
    <box flexDirection="column" width="100%" flexGrow={1}>
      {/* Scroll indicator: above */}
      {itemsAbove > 0 && (
        <text>
          <span fg="#585858">  ({itemsAbove} more above)</span>
        </text>
      )}

      {/* Visible items */}
      {observations.slice(startIndex, endIndex).map((obs, i) => (
        <ObservationItem
          key={obs.id}
          observation={obs}
          isSelected={startIndex + i === selectedIndex}
        />
      ))}

      {/* Scroll indicator: below */}
      {itemsBelow > 0 && (
        <text>
          <span fg="#585858">  ({itemsBelow} more below)</span>
        </text>
      )}
    </box>
  );
}

export default ObservationList;
