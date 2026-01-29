/**
 * QuitDialog — Modal confirmation before saving and exiting.
 *
 * Layout:
 * ╭─────────────────────────────────────────────────────╮
 * │                                                     │
 * │   Save changes before quitting?                     │
 * │   2 approved · 1 denied                             │
 * │                                                     │
 * │   Y save & quit   N discard   C cancel              │
 * │                                                     │
 * ╰─────────────────────────────────────────────────────╯
 */

import { useKeyboard } from "@opentui/react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QuitDialogProps {
  approvedCount: number;
  deniedCount: number;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuitDialog({
  approvedCount,
  deniedCount,
  onSave,
  onDiscard,
  onCancel,
}: QuitDialogProps) {
  const hasChanges = approvedCount > 0 || deniedCount > 0;

  useKeyboard((key) => {
    if (key.eventType === "repeat") return;

    switch (key.name) {
      case "y":
      case "return":
        onSave();
        return;
      case "n":
        onDiscard();
        return;
      case "c":
      case "escape":
        onCancel();
        return;
    }
  });

  return (
    <box
      position="absolute"
      left="50%"
      top="50%"
      border
      borderStyle="rounded"
      borderColor="#5F87D7"
      padding={2}
      backgroundColor="#1a1a1a"
      zIndex={100}
    >
      <box flexDirection="column" gap={1}>
        {/* Title */}
        <text>
          <span fg="#E4E4E4">
            <strong>Save changes before quitting?</strong>
          </span>
        </text>

        {/* Stats */}
        {hasChanges && (
          <text>
            <span fg="#808080">
              {approvedCount} approved · {deniedCount} denied
            </span>
          </text>
        )}
        {!hasChanges && (
          <text>
            <span fg="#585858">No changes to save</span>
          </text>
        )}

        {/* Spacer */}
        <text> </text>

        {/* Actions */}
        <text>
          <span fg="#00D787">Y</span>
          <span fg="#808080"> save & quit   </span>
          <span fg="#D75F5F">N</span>
          <span fg="#808080"> discard   </span>
          <span fg="#5F87D7">C</span>
          <span fg="#808080"> cancel</span>
        </text>
      </box>
    </box>
  );
}

export default QuitDialog;
