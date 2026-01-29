/**
 * Header — Rounded container with title and stats.
 *
 * Layout:
 * ╭─────────────────────────────────────────────────────────────────────────────╮
 * │                                                                             │
 * │   sanj          5 to review     ✓ 2     ✗ 1     → 0                   1/5   │
 * │                                                                             │
 * ╰─────────────────────────────────────────────────────────────────────────────╯
 */


// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HeaderProps {
  pendingCount: number;
  approvedCount: number;
  deniedCount: number;
  skippedCount: number;
  currentIndex: number;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Header({
  pendingCount,
  approvedCount,
  deniedCount,
  skippedCount,
  currentIndex,
  totalCount,
}: HeaderProps) {
  const position = totalCount > 0 ? `${currentIndex + 1}/${totalCount}` : "";

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#444444"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      width="100%"
    >
      <box flexDirection="row" justifyContent="space-between" width="100%">
        {/* Title */}
        <text>
          <span fg="#00D7D7"><strong>sanj</strong></span>
        </text>

        {/* Stats */}
        <text>
          <span fg="#D7D700">{pendingCount} to review</span>
          {"     "}
          <span fg="#00D787">✓ {approvedCount}</span>
          {"   "}
          <span fg="#D75F5F">✗ {deniedCount}</span>
          {"   "}
          <span fg="#5F87D7">→ {skippedCount}</span>
          {"     "}
          <span fg="#808080">{position}</span>
        </text>
      </box>
    </box>
  );
}

export default Header;
