# GEMINI.md

This file provides guidance to Gemini CLI when working with code in this repository.

## Context

**Read `llms.txt` first** for complete project context, architecture decisions, and coding conventions. The `llms.txt` file references the human-focused documentation (README.md and DEVELOPER_GUIDE.md) which contain all the detailed information.

## Quick Reference

- **Project Context**: See [llms.txt](llms.txt)
- **Human Documentation**: See [README.md](README.md) and [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
- **Development Workflow**: After changes, run `npm run lint && npm run build && npm test`

## Key Principles

- Follow patterns in `llms.txt`
- Reference README.md and DEVELOPER_GUIDE.md for detailed instructions
- Use strict TypeScript (no `any`, explicit return types)
- Extend `ApiOperation` or `SimpleApiOperation` for new endpoints
- Use `EnvLoader` for configuration, never access `process.env` directly
