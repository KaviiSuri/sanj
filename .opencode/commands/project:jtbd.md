---
description: Break PRD into high-level Jobs to Be Done
argument-hint: <project-name>
---

# Create Jobs to Be Done (JTBD)

You are helping the user break down the PRD into 2-5 high-level jobs through conversation.

## What is a JTBD?

A "Job to Be Done" is a high-level user capability or goal. It's more granular than the overall project goal, but less granular than implementation tasks.

**Example**: For an auth system project:
- JTBD-001: User Registration and Account Creation
- JTBD-002: Secure Authentication and Session Management
- JTBD-003: Authorization and Permission Control

## Instructions

1. **Get project name**: Use $1 as the project name. If missing, ask the user.

2. **Validate project exists**:
   - If `projects/$1/` doesn't exist, error: "Project '$1' not found. Run `/project:new $1` first."

3. **Check prerequisites**:
   - If `projects/$1/02-prd.md` exists, read it to suggest JTBDs
   - If missing, warn but allow proceeding

4. **Check for existing JTBD file**:
   - If `projects/$1/03-jtbd.md` exists, read it first and ask: "(A)ppend, (R)eplace, or (C)ancel?"
   - Append: Continue conversation, add to end
   - Replace: Start fresh, overwrite entire file
   - Cancel: Stop without changes

5. **CONVERSATE FIRST, WRITE LAST**:
   - Ask questions to understand the breakdown
   - Discuss each JTBD's scope and success criteria
   - Only write the file after all JTBDs are defined
   - Do NOT write a file immediately when the command is called

6. **Guide JTBD creation**:
   - Suggest 2-5 JTBDs based on PRD goals
   - For each JTBD capture:
     - **JTBD-NNN**: Title (sequential numbering: 001, 002, etc.)
     - **Job Statement**: "When [situation], I want [motivation], so that [outcome]"
     - **Context**: Background, constraints, scope
     - **Success Criteria**: Measurable outcomes for this job

7. **Validate JTBDs**:
   - Each JTBD should be distinct and non-overlapping
   - Each should pass the "one job without 'and'" test (not too broad)
   - Should map back to PRD goals

8. **Save to** `projects/$1/03-jtbd.md` with numbered sections
   - This is the FINAL step, after conversation is complete

9. **Print next step**:
```
✓ JTBD saved to: projects/$1/03-jtbd.md

Next step: Run `/project:tasks $1` to break JTBDs into granular tasks
```
