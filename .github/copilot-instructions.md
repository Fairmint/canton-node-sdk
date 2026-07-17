# GitHub Copilot Instructions

## Documentation

Start with the public [wiki Home](https://github.com/Fairmint/canton-node-sdk/wiki) and
[Contributing](https://github.com/Fairmint/canton-node-sdk/wiki/Contributing). Follow
[`CLAUDE.md`](../CLAUDE.md) before substantive work. The public entrypoint, generated-client
source, runnable examples, and tests are the source of truth for exact behavior.

## Coding Style

**Strict types are mandatory.** Always use explicit return types. Never use `any`. The project has
strict TypeScript settings enabled (`noImplicitAny`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, etc.).

**Keep it brief.** No verbose write-ups or lengthy comments. If you have questions, keep them short.

**Focus on the future.** Don't include comments about old code or how we got here. Code should only
reflect the current state.

## Testing

Tests should be informal and non-exhaustive:

- Focus on happy cases (include some error cases)
- Demonstrate the format of information in and out of SDK functions
- Keep tests simple and clear

## Development

**Fix warnings and errors** when making changes by running `npm run fix` (auto-formats with
Prettier).

**Refer to GitHub Actions scripts** in `.github/workflows/` for setup and test commands available.
