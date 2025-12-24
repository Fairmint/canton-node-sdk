# CLAUDE.md

**Read `llms.txt`** — it is the source of truth for this repository.

This file exists only for discoverability.

## PR Review Format

When writing PR reviews, use this format:

1. **Issues and improvements first** — Call out any problems, bugs, or suggested improvements at the top, outside any collapsed sections. This is the only feedback reviewers need to see immediately.

2. **Collapse the rest** — Put the full analysis and any positive remarks inside a collapsed `<details>` section:

```markdown
### Issues

- **[File:Line]** Description of issue or improvement

---

<details>
<summary>Full Analysis</summary>

... detailed analysis, positive remarks, etc. ...

</details>
```

Keep the visible portion brief and actionable. The collapsed section is for context if needed.
