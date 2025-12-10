# AGENTS.md

This file provides guidance to OpenAI Codex and other AI agents when working with this repository.

## Context

**Read `llms.txt` first** for complete project context, architecture decisions,
and coding conventions.

## Project Overview

The Canton Node SDK is a TypeScript SDK for interacting with Canton blockchain nodes. It provides type-safe, OAuth2-authenticated clients for Ledger JSON API, Validator API, and other Canton services.

## Key Commands

- `npm run build` - Full build (includes linting and TypeScript compilation)
- `npm run build:core` - Generate client methods, OpenAPI types, and compile TypeScript
- `npm test` - Run unit tests
- `npm run lint` - Run all linting (ESLint + Prettier)
- `npm run generate:openapi-types` - Generate TypeScript types from OpenAPI specs

## Important Notes

- Follow patterns in `llms.txt`
- Use strict TypeScript - no `any` types
- Always provide explicit return types
- Use `EnvLoader` for configuration, never access `process.env` directly
- Extend `ApiOperation` or `SimpleApiOperation` for new endpoints
- Use Zod schemas for validation
- Use generated OpenAPI types instead of manually defining API types

## Development Workflow

After making code changes, always run:
```bash
npm run lint && npm run build && npm test
```
