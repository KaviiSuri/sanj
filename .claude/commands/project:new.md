---
description: Create a new project with organized folder structure
argument-hint: <project-name>
---

# Create New Project

You are helping the user create a new project folder for ralphctl.

## Instructions

1. **Get project name**: Use $1 as the project name. If missing, ask the user for it.

2. **Validate project name**:
   - Must be alphanumeric with optional hyphens and underscores
   - No spaces, special characters, or leading/trailing hyphens
   - Examples: `auth-system`, `user_profiles`, `api-v2`

3. **Check if project exists**:
   - If `projects/$1/` already exists, error and stop
   - Message: "Project '$1' already exists. Choose a different name or delete the existing project."

4. **Create folder structure**:
   - `projects/$1/`
   - `projects/$1/specs/`

5. **Generate ONLY** `IMPLEMENTATION_PLAN.md` with placeholder content:
   - Do NOT create 01-research.md, 02-prd.md, 03-jtbd.md, 04-tasks.md, 05-hld.md
   - Those files will be created by their respective commands (/project:research, /project:prd, etc.)

6. **Print success message**:
```
✓ Created project: $1

Folder structure:
  projects/$1/
  ├── specs/
  └── IMPLEMENTATION_PLAN.md

Next step: Run `/project:research $1` to start capturing research
```
