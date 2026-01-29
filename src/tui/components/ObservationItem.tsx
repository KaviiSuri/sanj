/**
 * ObservationItem — Renders a single observation for the review list.
 *
 * Layout (selected):
 *  ┃ [5×] User prefers functional programming over imperative style
 *  ┃      pattern · Jan 15 → Jan 28 · seen in 3 sessions
 *
 * Layout (unselected):
 *    [3×] Always runs tests before committing changes
 *         workflow · Jan 20 → Jan 27 · seen in 2 sessions
 */

import type { Observation } from "../../core/types.ts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ObservationItemProps {
  observation: Observation;
  isSelected?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(obs: Observation): string {
  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return "unknown";
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "unknown";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const first = formatDate(obs.firstSeen);
  const last = formatDate(obs.lastSeen);

  return first === last ? first : `${first} → ${last}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ObservationItem({
  observation,
  isSelected = false,
}: ObservationItemProps) {
  const sessionCount = observation.sourceSessionIds?.length ?? 0;
  const category = observation.category ?? "other";

  if (isSelected) {
    return (
      <box flexDirection="column" marginBottom={1}>
        {/* Line 1: Accent + Count + Text */}
        <text>
          <span fg="#00D7D7">┃ </span>
          <span fg="#D7D700"><strong>[{observation.count}×]</strong></span>
          {" "}
          <span fg="#E4E4E4"><strong>{observation.text}</strong></span>
        </text>

        {/* Line 2: Accent + Metadata */}
        <text>
          <span fg="#00D7D7">┃</span>
          <span fg="#585858">
            {"      "}{category} · {formatDateRange(observation)} · seen in {sessionCount} session{sessionCount !== 1 ? "s" : ""}
          </span>
        </text>
      </box>
    );
  }

  // Unselected state
  return (
    <box flexDirection="column" marginBottom={1}>
      {/* Line 1: Count + Text */}
      <text>
        {"   "}
        <span fg="#00D7D7">[{observation.count}×]</span>
        {" "}
        <span fg="#808080">{observation.text}</span>
      </text>

      {/* Line 2: Metadata */}
      <text>
        <span fg="#585858">
          {"        "}{category} · {formatDateRange(observation)} · seen in {sessionCount} session{sessionCount !== 1 ? "s" : ""}
        </span>
      </text>
    </box>
  );
}

export default ObservationItem;
