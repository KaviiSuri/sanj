/**
 * PromotionList — TUI component for reviewing long-term to core promotions.
 *
 * Displays long-term memories that meet promotion thresholds.
 * Users can approve (write to core memory files), deny, or skip each item.
 *
 * Layout mirrors ObservationList for UX consistency.
 *
 * @module tui/components/PromotionList
 */

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text } from "@opentui/react";
import type { LongTermMemory } from "../../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PromotionListProps {
  /** Long-term memories ready for promotion */
  memories: LongTermMemory[];
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when selection changes */
  onSelectionChange?: (index: number) => void;
  /** Callback when user approves promotion */
  onApprove?: () => void;
  /** Callback when user denies promotion */
  onDeny?: () => void;
  /** Callback when user skips promotion */
  onSkip?: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Message shown when list is empty */
  emptyMessage?: string;
  /** Whether the list section has focus */
  isFocused?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: format date
// ---------------------------------------------------------------------------

function formatDate(date: Date | string | undefined): string {
  if (!date) return "unknown";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "unknown";
  return d.toISOString().split("T")[0]!;
}

// ---------------------------------------------------------------------------
// Helper: format days since
// ---------------------------------------------------------------------------

function daysSince(date: Date | string | undefined): number {
  if (!date) return 0;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// PromotionItem (single row)
// ---------------------------------------------------------------------------

function PromotionItem({
  memory,
  isSelected,
}: {
  memory: LongTermMemory;
  isSelected: boolean;
}) {
  const obs = memory.observation;
  const days = daysSince(memory.promotedAt);

  return (
    <Box
      borderStyle={isSelected ? "heavy" : "single"}
      borderColor={isSelected ? "cyan" : "gray"}
      paddingX={1}
      width="100%"
    >
      <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
        {obs.text.length > 70 ? obs.text.slice(0, 67) + "..." : obs.text}
      </Text>
      <Box flexDirection="row" width="100%">
        <Text color="yellow" dimColor={!isSelected}>
          {`  Count: ${obs.count}`}
        </Text>
        <Text color="gray" dimColor={!isSelected}>
          {`  |  In long-term: ${days}d`}
        </Text>
        <Text color="gray" dimColor={!isSelected}>
          {`  |  First seen: ${formatDate(obs.firstSeen)}`}
        </Text>
      </Box>
      {obs.category && (
        <Text color="blue" dimColor={!isSelected}>
          {`  Category: ${obs.category}`}
        </Text>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// PromotionList Component
// ---------------------------------------------------------------------------

export function PromotionList({
  memories,
  selectedIndex,
  onSelectionChange,
  onApprove,
  onDeny,
  onSkip,
  isLoading = false,
  emptyMessage = "No long-term memories ready for promotion.",
  isFocused = true,
}: PromotionListProps) {
  // Clamp index
  const safeIndex = Math.min(
    Math.max(0, selectedIndex),
    Math.max(0, memories.length - 1)
  );

  // Keyboard handler for navigation
  useEffect(() => {
    if (!isFocused) return;

    const handleKey = (event: { key: string }) => {
      const key = event.key;
      if (key === "ArrowUp" && onSelectionChange) {
        onSelectionChange(Math.max(0, safeIndex - 1));
      } else if (key === "ArrowDown" && onSelectionChange) {
        onSelectionChange(Math.min(memories.length - 1, safeIndex + 1));
      } else if ((key === "a" || key === "A") && onApprove) {
        onApprove();
      } else if ((key === "d" || key === "D") && onDeny) {
        onDeny();
      } else if ((key === "s" || key === "S") && onSkip) {
        onSkip();
      }
    };

    process.on("keydown", handleKey as () => void);
    return () => process.removeListener("keydown", handleKey as () => void);
  }, [isFocused, safeIndex, memories.length, onSelectionChange, onApprove, onDeny, onSkip]);

  // Loading state
  if (isLoading) {
    return (
      <Box paddingX={2} paddingY={1} width="100%">
        <Text color="gray">Loading promotion candidates...</Text>
      </Box>
    );
  }

  // Empty state
  if (memories.length === 0) {
    return (
      <Box paddingX={2} paddingY={2} width="100%">
        <Text color="gray">{emptyMessage}</Text>
        <Text color="gray" dim>
          {"Memories need sufficient count and time in long-term to be promotable."}
        </Text>
      </Box>
    );
  }

  // Position indicator
  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} width="100%">
        <Text color="gray" dim>
          {`Promotion candidates: ${safeIndex + 1}/${memories.length}`}
        </Text>
      </Box>

      <Box flexDirection="column" width="100%" flexGrow={1}>
        {memories.map((memory, idx) => (
          <PromotionItem
            key={memory.id}
            memory={memory}
            isSelected={idx === safeIndex}
          />
        ))}
      </Box>
    </Box>
  );
}

export default PromotionList;
