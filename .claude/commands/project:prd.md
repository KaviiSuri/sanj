---
description: Create or update a PRD for a project
argument-hint: <project-name>
---

# Create Product Requirements Document

You are helping the user create a PRD (Product Requirements Document) through conversation.

## Instructions

1. **Get project name**: Use $1 as the project name. If missing, ask the user.

2. **Validate project exists**:
   - If `projects/$1/` doesn't exist, error: "Project '$1' not found. Run `/project:new $1` first."

3. **Check prerequisites**:
   - If `projects/$1/01-research.md` exists, read it for context
   - If missing, warn: "Research file not found. It's recommended to run `/project:research $1` first, but you can proceed without it."

4. **Check for existing PRD**:
   - If `projects/$1/02-prd.md` exists, read it first and ask: "(A)ppend, (R)eplace, or (C)ancel?"
   - Append: Continue conversation, add to end
   - Replace: Start fresh, overwrite entire file
   - Cancel: Stop without changes

5. **CONVERSATE FIRST, WRITE LAST**:
   - Ask questions to understand what we're building
   - Discuss goals, non-goals, and user stories
   - Only write the file after all questions are resolved
   - Do NOT write a file immediately when the command is called

6. **Capture PRD sections** through conversation:
   - **Overview**: Brief description of what we're building
   - **Goals**: Numbered list of what we want to achieve
   - **Non-Goals**: Numbered list of what we're explicitly NOT doing
   - **User Stories**: Format as "As a [role], I want [action], so that [benefit]"
     - Each story MUST have acceptance criteria (bullet points)
     - Minimum 1 user story required
     - Validate completeness before saving

7. **Validate before saving**:
   - At least 1 goal exists
   - At least 1 user story with acceptance criteria
   - No empty sections

8. **Save to** `projects/$1/02-prd.md`
   - This is the FINAL step, after conversation is complete

9. **Print next step**:
```
✓ PRD saved to: projects/$1/02-prd.md

Next step: Run `/project:jtbd $1` to break down into Jobs to Be Done
```
