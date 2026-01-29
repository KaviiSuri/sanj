/**
 * EmptyState — Centered message when no observations to review.
 *
 * Layout:
 *                             ✓  All done!
 *
 *                    5 approved  ·  1 denied  ·  2 skipped
 *
 *                          Press Q to save and exit
 */


// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  approvedCount: number;
  deniedCount: number;
  skippedCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmptyState({
  approvedCount,
  deniedCount,
  skippedCount,
}: EmptyStateProps) {
  const hasActivity = approvedCount > 0 || deniedCount > 0 || skippedCount > 0;

  return (
    <box flexDirection="column" alignItems="center" paddingTop={4} paddingBottom={4} width="100%">
      {/* Main message */}
      <text>
        <span fg="#00D787"><strong>✓  All done!</strong></span>
      </text>

      <text> </text>

      {/* Stats summary */}
      {hasActivity && (
        <text>
          <span fg="#808080">
            {approvedCount} approved  ·  {deniedCount} denied  ·  {skippedCount} skipped
          </span>
        </text>
      )}

      <text> </text>

      {/* Exit hint */}
      <text>
        <span fg="#585858">Press Q to save and exit</span>
      </text>
    </box>
  );
}

export default EmptyState;
