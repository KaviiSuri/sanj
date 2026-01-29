/**
 * StatusLine — Clean bottom bar with actions and navigation hints.
 *
 * Layout:
 * ─────────────────────────────────────────────────────────────────────────────
 *  A approve   D deny   S skip   U undo(2)  │  j/k navigate   gg/G jump   Q quit
 */


// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StatusLineProps {
  undoDepth: number;
  disabled?: boolean;
  terminalWidth?: number;
  gPending?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusLine({
  undoDepth,
  disabled = false,
  terminalWidth = 80,
  gPending = false,
}: StatusLineProps) {
  const separatorWidth = Math.max(terminalWidth - 2, 40);

  if (disabled) {
    return (
      <box flexDirection="column" width="100%">
        <text>
          <span fg="#444444">{"─".repeat(separatorWidth)}</span>
        </text>
        <text>
          <span fg="#585858"> Q quit and save</span>
        </text>
      </box>
    );
  }

  const undoText = undoDepth > 0 ? `U undo(${undoDepth})` : "U undo";
  const undoColor = undoDepth > 0 ? "#808080" : "#585858";

  return (
    <box flexDirection="column" width="100%">
      {/* Separator line */}
      <text>
        <span fg="#444444">{"─".repeat(separatorWidth)}</span>
      </text>

      {/* Actions and navigation */}
      <text>
        <span fg="#00D787"> A</span>
        <span fg="#808080"> approve   </span>
        <span fg="#D75F5F">D</span>
        <span fg="#808080"> deny   </span>
        <span fg="#5F87D7">S</span>
        <span fg="#808080"> skip   </span>
        <span fg={undoColor}>{undoText}</span>
        <span fg="#585858">  │  j/k navigate   gg/G jump   Q quit</span>
        {gPending && <span fg="#D7D700">  g...</span>}
      </text>
    </box>
  );
}

export default StatusLine;
