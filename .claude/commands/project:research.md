---
description: Guide multi-source research for a project
argument-hint: <project-name>
---

# Capture Project Research

You are helping the user conduct comprehensive research for a project through intelligent triage between user questions, web research, and codebase exploration.

## Instructions

1. **Get project name**: Use $1 as the project name. If missing, ask the user.

2. **Validate project exists**:
   - If `projects/$1/` doesn't exist, error: "Project '$1' not found. Run `/project:new $1` first."

3. **Check for existing research**:
   - If `projects/$1/01-research.md` exists, read it first and ask: "(A)ppend, (R)eplace, or (C)ancel?"
   - Append: Continue conversation, add to end
   - Replace: Start fresh, overwrite entire file
   - Cancel: Stop without changes

4. **CONVERSATE FIRST, WRITE LAST**:
   - Engage in conversation to understand the project idea
   - Conduct research through user questions, web searches, and codebase exploration
   - Only write the file after all questions are resolved
   - Do NOT write a file immediately when the command is called

5. **Research Triage - Classify each information need**:

   For every question that arises during research, determine which category it falls into:

   **A. User Question (ask directly)**:
   - Product decisions (features, priorities, user experience)
   - Business trade-offs (timeline vs scope, cost vs quality)
   - Human preferences (naming, UI choices, workflows)
   - Domain knowledge the user possesses
   → Ask the user directly

   **B. Web Research (spawn subagent)**:
   - Technical protocols, standards, specifications
   - External library documentation and usage patterns
   - Implementation details available online
   - Prior art, reference implementations, benchmarks
   - Best practices for specific technologies
   → Spawn isolated subagent with WebSearch/WebFetch. Request summary only, not raw outputs.

   **C. Codebase Exploration (spawn subagent)**:
   - How similar features are currently implemented
   - Existing patterns, conventions, and architectural decisions
   - Available utilities, services, or components to reuse
   - Configuration, build setup, dependency management
   - Test patterns and project structure
   → Spawn isolated subagent with Glob/Grep/Read. Request summary only, not raw file dumps.

   **D. Technical Decision (research first, present options)**:
   - Implementation approach with multiple valid options
   - Technology choice where alternatives exist
   - Architecture decision with trade-offs
   → Spawn subagent(s) to research options, then present findings with pros/cons to user for decision

6. **Subagent Pattern for Research**:

   When spawning a research subagent:
   ```
   "Research [specific topic] and provide a concise summary:
    - What you found (key points only)
    - How it applies to this project
    - Any recommendations or considerations
    Do NOT include raw search results, full file contents, or exhaustive detail.
    Return only the distilled summary."
   ```

7. **Capture research sections** through conversation:
   - **Problem Statement**: What problem are we solving? Why does it matter?
   - **Web Research Findings**: External research summaries (via subagents)
   - **Codebase Analysis**: Relevant existing code patterns (via subagents)
   - **Constraints**: Technical limitations, business requirements, timeline constraints
   - **Technical Decisions**: Options presented and decisions made (with rationale)
   - **Open Questions**: What remains unclear or needs further investigation?

8. **Save to** `projects/$1/01-research.md` in markdown format with clear section headers
   - This is the FINAL step, after conversation is complete

9. **Print next step**:
```
✓ Research saved to: projects/$1/01-research.md

Next step: Run `/project:prd $1` to create the PRD
```
