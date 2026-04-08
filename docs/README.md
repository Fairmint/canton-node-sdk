# Fairmint User Documentation

Version-controlled source of truth for all user-facing documentation.

## How it works

- **Source of truth**: Markdown files in this repo
- **Deployment target**: Intercom Articles API (education.fairmint.com)
- **Intercom is a view, not the source.** Like deploying code to Lambda — you don't edit Lambda functions in the AWS console.

## Structure

```
founders/     ~10 targeted step-by-step articles for Studio users
investors/    Phase 2 — after Studio validation
```

## Sync manifest

`sync-manifest.json` tracks the mapping between each Markdown file and its Intercom article (article ID, checksum of last push). The doc agent updates this automatically.

## Doc agent

A persistent agent generates and maintains these articles from source code. It:
1. Reads source code from API, Studio, Series, and Investor repos
2. Reads existing Intercom articles for context
3. Generates Markdown, commits here, converts to HTML, pushes to Intercom
4. New articles are pushed as drafts (PM reviews before publishing)
5. Updates to existing articles auto-publish (with pre-flight safety check)

## Links

- [Task file (ENG-618)](https://linear.app/fairmint/issue/ENG-618/automated-documentation)
- [Help Center](https://education.fairmint.com/en/)
