# Agent Operations Guide

## Running the Project

### Initial Setup
```bash
bun install         # Install dependencies
```

### Development
```bash
bun run dev         # Run CLI in development mode
```

### Building
```bash
bun run build       # Build to dist/cli.js
```

### Testing
```bash
bun test            # Run test suite
```

### Running Built CLI
```bash
bun run start       # Run built CLI from dist/
```

## Project Status
- **Runtime**: Bun (not npm/yarn)
- **TypeScript**: 5.9.3
- **Module System**: ESM only (type: "module")
- **Current Version**: 0.0.0 (Wave 1 in progress)

## Key Commands

### TypeScript Check
```bash
bunx tsc --version  # Verify TypeScript is available
```

### Directory Verification
```bash
ls -d src/cli src/core src/adapters src/storage src/tui tests
```

## Important Notes
- This project uses Bun, not npm or yarn
- CLERC requires ESM modules
- All source code is in src/
- Built output goes to dist/
