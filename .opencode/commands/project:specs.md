---
description: Generate spec files from task breakdown
argument-hint: <project-name>
---

# Generate Spec Files

You are generating individual spec files for each task using isolated subagents.

**Note**: This command spawns multiple subagents. Confirm before proceeding.

## Instructions

1. **Get project name**: Use $1 as the project name. If missing, ask the user.

2. **Validate project exists**:
   - If `projects/$1/` doesn't exist, error: "Project '$1' not found. Run `/project:new $1` first."

3. **Check prerequisites**:
   - Read `projects/$1/04-tasks.md` (error if missing: "Tasks file required. Run `/project:tasks $1` first.")
   - Check for `projects/$1/03-jtbd.md` (warn if missing but allow proceeding with confirmation)

4. **Parse tasks**:
   - Extract all task IDs (format: `NNN-MMM`)
   - Extract task descriptions
   - Extract dependencies

5. **CONFIRM before generating**:
   - Show summary: "Found X tasks. This will spawn X subagents to generate spec files."
   - Ask: "Proceed with spec generation? (Y/n)"
   - Only proceed if user confirms

6. **For each task, spawn isolated subagent** (Sonnet model):
   - **Critical**: Subagent reads ONLY from filesystem artifacts (01-research.md, 02-prd.md, 03-jtbd.md, 04-tasks.md, 05-hld.md if present)
   - **No conversation context** - validates artifacts are complete
   - Generate spec file with:
     - Task ID and JTBD reference
     - Purpose (what this accomplishes)
     - Scope (in/out of scope)
     - Acceptance criteria (verification steps)
     - Implementation notes (technical guidance)
     - Dependencies (from task breakdown)

7. **Create spec files**:
   - Save to `projects/$1/specs/jtbd-NNN-task-MMM.md`
   - Show progress: "Generating spec N/TOTAL..."
   - Continue on error (log failed specs)

8. **Create/update IMPLEMENTATION_PLAN.md**:
   - List all tasks in wave order
   - Mark status (Pending/In Progress/Complete)
   - Include dependencies and blocks

9. **Print completion**:
```
✓ Generated X specs in: projects/$1/specs/
✓ Created/updated: projects/$1/IMPLEMENTATION_PLAN.md

Next step: Run `ralphctl run plan --project $1` to start implementation
```
