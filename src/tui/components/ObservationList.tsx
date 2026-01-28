/**
 * ObservationList — Scrollable list of ObservationItem components.
 *
 * Manages:
 * - Rendering all observations via ObservationItem
 * - Visual selection indicator based on selectedIndex
 * - Empty and loading states
 * - Proper spacing between items
 *
 * Layout:
 * ┌─ Observations ──────────────────────────────┐
 * │ ┌─────────────────────────────────────────┐ │
 * │ │ [5x] Pattern about using X feature     │ │  ← selected (bold border)
 * │ └─────────────────────────────────────────┘ │
 * │ ┌─────────────────────────────────────────┐ │
 * │ │ [3x] Preference for Y style            │ │  ← unselected
 * │ └─────────────────────────────────────────┘ │
 * └─────────────────────────────────────────────┘
 */

import React from "react";
import { Box, Text } from "@opentui/react";
import { ObservationItem } from "./ObservationItem.tsx";
import type { Observation } from "../../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ObservationListProps {
  /** Observations to render */
  observations: Observation[];
  /** Index of the currently selected item */
  selectedIndex?: number;
  /** Callback when selection changes */
  onSelectionChange?: (index: number) => void;
  /** Callback when approve action triggered */
  onApprove?: (observation: Observation) => void;
  /** Callback when deny action triggered */
  onDeny?: (observation: Observation) => void;
  /** Callback when skip action triggered */
  onSkip?: (observation: Observation) => void;
  /** Optional title displayed above the list */
  title?: string;
  /** Whether data is still loading */
  isLoading?: boolean;
  /** Message shown when no observations exist */
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ObservationList({
  observations,
  selectedIndex = 0,
  onSelectionChange: _onSelectionChange,
  onApprove: _onApprove,
  onDeny: _onDeny,
  onSkip: _onSkip,
  title,
  isLoading = false,
  emptyMessage = "No observations pending.",
}: ObservationListProps) {
  // Clamp index defensively
  const safeIndex =
    observations.length > 0
      ? Math.max(0, Math.min(selectedIndex, observations.length - 1))
      : 0;

  // Loading state
  if (isLoading) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="gray">Loading observations...</Text>
      </Box>
    );
  }

  // Empty state
  if (observations.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="gray">{emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      {/* Optional title */}
      {title && (
        <Box paddingX={1} paddingY={0}>
          <Text bold color="cyan">{title}</Text>
        </Box>
      )}

      {/* Position indicator */}
      <Box paddingX={1}>
        <Text color="gray" dim>
          {`${safeIndex + 1}/${observations.length}`}
        </Text>
      </Box>

      {/* Observation items */}
      {observations.map((observation, index) => (
        <Box key={observation.id} paddingY={0} width="100%">
          <ObservationItem
            observation={observation}
            isSelected={index === safeIndex}
          />
        </Box>
      ))}
    </Box>
  );
}

export default ObservationList;
