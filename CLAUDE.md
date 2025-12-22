# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context

**Read `llms.txt` first** for project context, architecture, conventions, and commands.

## Quick Reference

### After Any Change

```bash
npm run lint && npm run build && npm test
```

### Key Patterns

- Clients extend `BaseClient` (with auth) or `SimpleBaseClient` (no auth)
- Operations extend `ApiOperation` with typed request/response
- Config via `EnvLoader.getConfig()` or direct instantiation
- Strict TypeScript: no `any`, explicit return types
