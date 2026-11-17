# Bugbot rules

Review against this repository's own guidance:

- [`CLAUDE.md`](../CLAUDE.md)
- [`AGENTS.md`](../AGENTS.md)

## Reviewing pull requests

- Check the change against the guidance above and the code it touches. That guidance names each
  source of truth; cite the file or rule when a change conflicts with it.
- Put correctness, security, data loss, and broken migrations or deployments first. Skip formatting
  and lint nits: CI enforces them.
