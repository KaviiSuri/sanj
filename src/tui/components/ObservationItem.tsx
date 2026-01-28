/**
 * ObservationItem — Renders a single observation for the review list.
 *
 * Displays:
 * - Count badge and observation text
 * - First/last seen timestamps
 * - Source session references
 *
 * Visual states:
 * - Default: single border
 * - Selected (isSelected): bold border with cyan accent
 * - Highlighted (isHighlighted): distinct background indicator
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │ [3x] Pattern about using X feature              │
 * │ First seen: 2025-01-15 10:30 | Last: 01-25 14:00│
 * │ Sources: session-abc, session-def               │
 * └─────────────────────────────────────────────────┘
 */

import React from "react";
import { Box, Text } from "@opentui/react";
import type { Observation } from "../../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ObservationItemProps {
  /** The observation data to render */
  observation: Observation;
  /** Whether this item is currently selected via keyboard navigation */
  isSelected?: boolean;
  /** Whether this item matches a search/filter highlight */
  isHighlighted?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string | undefined): string {
  if (!date) return "unknown";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "unknown";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatSources(sessionIds: string[] | undefined): string {
  if (!sessionIds || sessionIds.length === 0) return "(unknown)";
  // Truncate long IDs for readability
  const truncated = sessionIds.map((id) =>
    id.length > 20 ? id.slice(0, 17) + "..." : id
  );
  return truncated.join(", ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ObservationItem({
  observation,
  isSelected = false,
  isHighlighted = false,
}: ObservationItemProps) {
  const borderStyle = isSelected ? "bold" : "single";
  const textColor = isSelected ? "white" : isHighlighted ? "cyan" : undefined;
  const countColor = isSelected ? "yellow" : "cyan";

  return (
    <Box
      borderStyle={borderStyle}
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      {/* Header row: count badge + observation text */}
      <Box flexDirection="row" width="100%">
        <Text bold color={countColor}>{`[${observation.count}x] `}</Text>
        <Text color={textColor}>{observation.text}</Text>
      </Box>

      {/* Metadata row: timestamps */}
      <Text color="gray" dim>
        {`First seen: ${formatDate(observation.firstSeen)} | Last seen: ${formatDate(observation.lastSeen)}`}
      </Text>

      {/* Sources row */}
      <Text color="gray" dim>
        {`Sources: ${formatSources(observation.sourceSessionIds)}`}
      </Text>
    </Box>
  );
}

export default ObservationItem;
