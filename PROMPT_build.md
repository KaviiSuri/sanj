0a. Study `{project}/specs/*` with up to 500 parallel {fast} subagents to learn the application specifications.
0b. Study @{project}/IMPLEMENTATION_PLAN.md.
0c. For reference, the application source code is in `src/*`.

1. Your task is to implement functionality per the specifications using parallel subagents. Follow @{project}/IMPLEMENTATION_PLAN.md and choose the most important item to address. Before making changes, search the codebase (don't assume not implemented) using {fast} subagents. You may use up to 500 parallel {fast} subagents for searches/reads and only 1 {fast} subagent for build/tests. Use {smart} subagents when complex reasoning is needed (debugging, architectural decisions).
2. After implementing functionality or resolving problems, run the tests for that unit of code that was improved. If functionality is missing then it's your job to add it as per the application specifications. Ultrathink.
3. When you discover issues, add them as checkboxes in @{project}/IMPLEMENTATION_PLAN.md (not prose paragraphs). When resolved, mark complete and remove.
4. When the tests pass, update @{project}/IMPLEMENTATION_PLAN.md, then `git add -A` then `git commit` with a message describing the changes. After the commit, `git push`.
5. stop after one spec is done. you do not need to keep going to other specs.

99999. Important: When authoring documentation, capture the why — tests and implementation importance.
999999. Important: Single sources of truth, no migrations/adapters. If tests unrelated to your work fail, resolve them as part of the increment.
9999999. As soon as there are no build or test errors create a git tag. If there are no git tags start at 0.0.0 and increment patch by 1 for example 0.0.1  if 0.0.0 does not exist.
99999999. You may add extra logging if required to debug issues.
999999999. Keep @{project}/IMPLEMENTATION_PLAN.md current by marking checkboxes complete and adding new issues as checkboxes. Do NOT append verbose completion logs or prose paragraphs — keep it as a clean checklist.
9999999999. When you learn something new, add it to a `## Learnings` section in @AGENTS.md. Keep learnings specific and actionable — like organizational memory for the team (e.g., correct commands, file locations, gotchas discovered).
99999999999. For any bugs you notice, resolve them or add a checkbox for them in @{project}/IMPLEMENTATION_PLAN.md so the next agent can address them.
999999999999. Implement functionality completely. Placeholders and stubs waste efforts and time redoing the same work.
9999999999999. When @{project}/IMPLEMENTATION_PLAN.md becomes large periodically clean out the items that are completed from the file using a subagent.
99999999999999. If you find inconsistencies in the {project}/specs/* then use an {smart} 4.5 subagent with 'ultrathink' requested to update the specs.
999999999999999. IMPORTANT: @AGENTS.md is for operational learnings (commands, how to run things). @{project}/IMPLEMENTATION_PLAN.md is for status tracking (checkboxes). Neither should have verbose prose or append-only logs.
