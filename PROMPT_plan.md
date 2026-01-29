0a. Study `{project}/specs/*` with up to 250 parallel {fast} subagents to learn the application specifications.
0b. Study @{project}/IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study `src/lib/*` with up to 250 parallel {fast} subagents to understand shared utilities & components.
0d. For reference, the application source code is in `src/*`.

1. Study @{project}/IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 {fast} subagents to study existing source code in `src/*` and compare it against `{project}/specs/*`. Use an {smart} subagent to analyze findings, prioritize tasks, and create/update @{project}/IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns. Study @{project}/IMPLEMENTATION_PLAN.md to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.

2. The whole plan must be trackable using checkboxes so humans can review it easily.

FORMAT: Keep IMPLEMENTATION_PLAN.md clean:
- `- [ ] Task name` (pending) or `- [x] Task name` (complete)
- Group by section/wave if needed
- NO implementation notes, NO learnings, NO verbose completion logs
- Details belong in specs, not in the plan

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Treat `src/lib` as the project's standard library for shared utilities and components. Prefer consolidated, idiomatic implementations there over ad-hoc copies.

ULTIMATE GOAL: We want to achieve [project-specific goal]. Consider missing elements and plan accordingly. If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at {project}/specs/FILENAME.md and add a checkbox for it in @{project}/IMPLEMENTATION_PLAN.md.

OUTPUT: In your response, clearly list:
- Any NEW specs you created
- Any NEW tasks you added to the plan
- So the user can review what changed before proceeding
