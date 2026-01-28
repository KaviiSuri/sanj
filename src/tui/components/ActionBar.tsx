/**
 * ActionBar — Displays Approve / Deny / Skip action buttons.
 *
 * This is a pure presentation component. Keyboard event handling
 * is the responsibility of the parent (App.tsx).
 *
 * Props:
 * - onApprove / onDeny / onSkip: callbacks invoked by parent on keypress
 * - disabled: grays out all buttons (e.g., empty list)
 * - isApproving / isDenying: shows loading text during async ops
 * - isFocused: indicates ActionBar has keyboard focus
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │  [a] Approve    [d] Deny    [s] Skip            │
 * └─────────────────────────────────────────────────┘
 */

import React from "react";
import { Box, Text } from "@opentui/react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActionBarProps {
  /** Called when user approves the selected observation */
  onApprove: () => void;
  /** Called when user denies the selected observation */
  onDeny: () => void;
  /** Called when user skips the selected observation */
  onSkip: () => void;
  /** When true, all actions are visually disabled */
  disabled?: boolean;
  /** Shows "Approving..." while processing */
  isApproving?: boolean;
  /** Shows "Denying..." while processing */
  isDenying?: boolean;
  /** Whether this bar currently has keyboard focus */
  isFocused?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionBar({
  onApprove: _onApprove,
  onDeny: _onDeny,
  onSkip: _onSkip,
  disabled = false,
  isApproving = false,
  isDenying = false,
  isFocused = false,
}: ActionBarProps) {
  const dimColor = disabled ? "gray" : undefined;
  const approveLabel = isApproving ? "Approving..." : "[a] Approve";
  const denyLabel = isDenying ? "Denying..." : "[d] Deny";
  const skipLabel = "[s] Skip";

  const focusIndicator = isFocused ? " ◀" : "";

  return (
    <Box
      borderStyle={isFocused ? "bold" : "single"}
      borderTop
      borderBottom
      paddingX={1}
      width="100%"
    >
      <Box flexDirection="row" width="100%">
        <Box paddingX={1}>
          <Text
            bold={!disabled}
            color={isApproving ? "yellow" : disabled ? "gray" : "green"}
          >
            {approveLabel}
          </Text>
        </Box>

        <Text color="gray">{"  |  "}</Text>

        <Box paddingX={1}>
          <Text
            bold={!disabled}
            color={isDenying ? "yellow" : disabled ? "gray" : "red"}
          >
            {denyLabel}
          </Text>
        </Box>

        <Text color="gray">{"  |  "}</Text>

        <Box paddingX={1}>
          <Text bold={!disabled} color={dimColor || "blue"}>
            {skipLabel}
          </Text>
        </Box>

        {focusIndicator && (
          <Text color="cyan">{focusIndicator}</Text>
        )}
      </Box>
    </Box>
  );
}

export default ActionBar;
