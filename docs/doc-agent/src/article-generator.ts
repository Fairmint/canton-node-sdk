/**
 * Article generator — uses LLM to produce Markdown from source code context.
 *
 * Handles:
 *  - Smart skip when source files haven't changed
 *  - Frontmatter parsing and merging (never let the LLM touch frontmatter)
 *  - Post-generation validation (H1 match, footer, no fabricated URLs)
 *  - Source-trace comments for change detection
 */
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { DOC_AGENT_SYSTEM_PROMPT, buildArticlePrompt } from "./prompt.js";
import type { SourceReader } from "./source-reader.js";
import type { IntercomClient } from "./intercom-client.js";
import type {
  ArticleTopic,
  ArticleGenerationResult,
  ArticleFrontmatter,
  ManifestEntry,
} from "./types.js";

const log = logger.child({ module: "article-generator" });

const EXISTING_ARTICLES_DIR = join(process.cwd(), "..", "existing-articles");
const CONVERSATIONS_DIR = join(process.cwd(), "..", "conversations");

const EXPECTED_FOOTER = "**Need help?** Reply in the chat — our team is happy to assist.";

/* ════════════════════════════════════════════════════════════════════ */

export class ArticleGenerator {
  private sourceReader: SourceReader;
  private intercomClient: IntercomClient;
  private existingArticlesCache: Map<string, string> | null = null;

  constructor(sourceReader: SourceReader, intercomClient: IntercomClient) {
    this.sourceReader = sourceReader;
    this.intercomClient = intercomClient;
  }

  /* ── Frontmatter helpers ─────────────────────────────────────────── */

  /**
   * Parse YAML frontmatter from a Markdown string. Returns the parsed
   * frontmatter object and the body (everything after the closing `---`).
   */
  static parseFrontmatter(markdown: string): { frontmatter: ArticleFrontmatter | null; body: string } {
    const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) return { frontmatter: null, body: markdown };

    const yamlBlock = fmMatch[1];
    const body = fmMatch[2];

    const fm: Record<string, unknown> = {};
    const changelogEntries: Array<{ date: string; by: string; summary: string }> = [];
    let inChangelog = false;
    let currentEntry: Record<string, string> = {};

    for (const line of yamlBlock.split("\n")) {
      if (line.match(/^changelog:\s*$/)) {
        inChangelog = true;
        continue;
      }
      if (inChangelog) {
        const entryStart = line.match(/^\s+-\s+date:\s*(.+)/);
        const entryBy = line.match(/^\s+by:\s*(.+)/);
        const entrySummary = line.match(/^\s+summary:\s*"?(.+?)"?\s*$/);
        if (entryStart) {
          if (currentEntry.date) changelogEntries.push(currentEntry as { date: string; by: string; summary: string });
          currentEntry = { date: entryStart[1].trim() };
        } else if (entryBy) {
          currentEntry.by = entryBy[1].trim();
        } else if (entrySummary) {
          currentEntry.summary = entrySummary[1].trim();
        } else if (!line.match(/^\s/) && line.trim()) {
          inChangelog = false;
          if (currentEntry.date) changelogEntries.push(currentEntry as { date: string; by: string; summary: string });
          const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*"?(.+?)"?\s*$/);
          if (kvMatch) fm[kvMatch[1]] = kvMatch[2];
        }
      } else {
        const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*"?(.+?)"?\s*$/);
        if (kvMatch) fm[kvMatch[1]] = kvMatch[2];
      }
    }
    if (currentEntry.date) changelogEntries.push(currentEntry as { date: string; by: string; summary: string });

    return {
      frontmatter: { ...fm, changelog: changelogEntries } as ArticleFrontmatter,
      body: body.trim(),
    };
  }

  /**
   * Serialize an ArticleFrontmatter back to YAML. Preserves the exact field
   * order used in all 58 articles.
   */
  static serializeFrontmatter(fm: ArticleFrontmatter): string {
    const lines: string[] = ["---"];

    const str = (key: string, val: unknown): void => {
      if (val === undefined || val === null) return;
      const s = String(val);
      if (s.includes(":") || s.includes('"') || s.includes("—") || s.includes("(") || s.includes("/")) {
        lines.push(`${key}: "${s}"`);
      } else {
        lines.push(`${key}: ${s}`);
      }
    };

    str("title", fm.title);
    str("section", fm.section);
    str("number", fm.number);
    str("status", fm.status);
    str("audience", fm.audience);
    str("gate", fm.gate);
    if (fm.intercom_id) str("intercom_id", fm.intercom_id);
    if (fm.intercom_state) str("intercom_state", fm.intercom_state);
    if (fm.intercom_created_at) str("intercom_created_at", fm.intercom_created_at);
    if (fm.intercom_updated_at) str("intercom_updated_at", fm.intercom_updated_at);
    if (fm.intercom_updated_by) str("intercom_updated_by", fm.intercom_updated_by);
    str("github_created_at", fm.github_created_at);
    str("github_created_by", fm.github_created_by);
    str("github_updated_at", fm.github_updated_at);
    str("github_updated_by", fm.github_updated_by);

    if (fm.changelog && fm.changelog.length > 0) {
      lines.push("changelog:");
      for (const entry of fm.changelog) {
        lines.push(`  - date: ${entry.date}`);
        lines.push(`    by: ${entry.by}`);
        lines.push(`    summary: "${entry.summary}"`);
      }
    }

    lines.push("---");
    return lines.join("\n");
  }

  /**
   * Merge topic metadata + existing frontmatter, bumping the updated_at
   * timestamp and appending a changelog entry.
   */
  static mergeFrontmatter(
    topic: ArticleTopic,
    existing: ArticleFrontmatter | null,
    changelogSummary: string,
  ): ArticleFrontmatter {
    const today = new Date().toISOString().slice(0, 10);
    const updater = "doc-agent";

    if (existing) {
      return {
        ...existing,
        title: topic.title,
        section: topic.section,
        number: topic.number,
        audience: topic.audience,
        gate: topic.gate,
        github_updated_at: today,
        github_updated_by: updater,
        changelog: [
          ...existing.changelog,
          { date: today, by: updater, summary: changelogSummary },
        ],
      };
    }

    return {
      title: topic.title,
      section: topic.section,
      number: topic.number,
      status: "Draft",
      audience: topic.audience,
      gate: topic.gate,
      github_created_at: today,
      github_created_by: updater,
      github_updated_at: today,
      github_updated_by: updater,
      changelog: [{ date: today, by: updater, summary: changelogSummary }],
    };
  }

  /* ── Post-generation validation ──────────────────────────────────── */

  /**
   * Strip any YAML frontmatter the LLM might have accidentally included.
   */
  private static stripAccidentalFrontmatter(text: string): string {
    return text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  }

  /**
   * Validate and fix the generated body to match our conventions.
   * Returns the cleaned body and a list of warnings.
   */
  private static validateBody(body: string, topic: ArticleTopic): { cleaned: string; warnings: string[] } {
    const warnings: string[] = [];
    let cleaned = body;

    const h1Match = cleaned.match(/^#\s+(.+)$/m);
    if (!h1Match) {
      warnings.push("Missing H1 title — prepending");
      cleaned = `# ${topic.title}\n\n${cleaned}`;
    } else if (h1Match[1].trim() !== topic.title) {
      warnings.push(`H1 mismatch: got "${h1Match[1].trim()}", expected "${topic.title}" — fixing`);
      cleaned = cleaned.replace(/^#\s+.+$/m, `# ${topic.title}`);
    }

    if (!cleaned.includes(EXPECTED_FOOTER)) {
      warnings.push("Missing standard footer — appending");
      cleaned = cleaned.trimEnd() + `\n\n---\n\n${EXPECTED_FOOTER}\n`;
    }

    const fabricatedEmails = cleaned.match(/[a-z]+@fairmint\.com/gi);
    if (fabricatedEmails) {
      for (const email of fabricatedEmails) {
        warnings.push(`Fabricated email detected: ${email} — removing`);
        cleaned = cleaned.replace(new RegExp(email.replace(".", "\\."), "g"), "[contact us in the chat]");
      }
    }

    const fabricatedUrls = cleaned.match(/https?:\/\/(?!one\.fairmint\.com|education\.fairmint\.com)[^\s)]+fairmint[^\s)]+/g);
    if (fabricatedUrls) {
      for (const url of fabricatedUrls) {
        warnings.push(`Suspicious URL detected: ${url}`);
      }
    }

    const sourcesComment = cleaned.match(/<!--\s*Sources:.*-->/);
    if (sourcesComment) {
      warnings.push("LLM included source trace comment — stripping (we add it programmatically)");
      cleaned = cleaned.replace(/\n*<!--\s*Sources:.*-->\s*$/, "");
    }

    return { cleaned: cleaned.trim(), warnings };
  }

  /* ── Existing article loading ────────────────────────────────────── */

  private loadExistingArticles(): Map<string, string> {
    if (this.existingArticlesCache) return this.existingArticlesCache;

    this.existingArticlesCache = new Map();
    try {
      const files = readdirSync(EXISTING_ARTICLES_DIR).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const content = readFileSync(join(EXISTING_ARTICLES_DIR, file), "utf-8");
        const titleMatch = content.match(/^# (.+)$/m);
        const title = titleMatch ? titleMatch[1] : file.replace(".md", "");
        this.existingArticlesCache.set(title.toLowerCase(), content);
      }
      log.info(`Loaded ${this.existingArticlesCache.size} existing articles from ${EXISTING_ARTICLES_DIR}`);
    } catch {
      log.warn("Could not load existing articles folder — generating without existing context");
    }
    return this.existingArticlesCache;
  }

  private findRelevantExistingArticles(topic: ArticleTopic): string {
    const existing = this.loadExistingArticles();
    if (existing.size === 0) return "";

    const matches: string[] = [];
    const searchLower = [
      topic.title.toLowerCase(),
      ...(topic.existingIntercomTitle ? [topic.existingIntercomTitle.toLowerCase()] : []),
      ...topic.searchTerms.map((t) => t.toLowerCase()),
    ];

    for (const [title, content] of existing) {
      for (const term of searchLower) {
        if (title.includes(term) || term.split(" ").some((w) => w.length > 3 && title.includes(w))) {
          matches.push(content);
          break;
        }
      }
    }

    if (matches.length === 0) return "";
    log.info(`Found ${matches.length} relevant existing articles for "${topic.title}"`);
    return matches.join("\n\n---\n\n");
  }

  private readConversations(topic: ArticleTopic): string {
    const slug = topic.filePath.replace("founders/", "").replace(".md", "");
    const filePath = join(CONVERSATIONS_DIR, `${slug}.md`);
    try {
      const content = readFileSync(filePath, "utf-8");
      log.info(`Loaded conversation context for "${topic.title}"`);
      return content;
    } catch {
      return "";
    }
  }

  /* ── Main generation ─────────────────────────────────────────────── */

  async generateArticle(
    topic: ArticleTopic,
    manifestEntry?: ManifestEntry,
    businessContext?: string,
  ): Promise<ArticleGenerationResult> {
    const startTime = Date.now();
    log.info(`Generating article: "${topic.title}"`, { filePath: topic.filePath });

    // 1. Read existing Markdown (previous version) and parse frontmatter
    const existingMarkdown = this.sourceReader.readDocsFile(topic.filePath);
    let existingFrontmatter: ArticleFrontmatter | null = null;
    let existingBody: string | undefined;

    if (existingMarkdown) {
      const parsed = ArticleGenerator.parseFrontmatter(existingMarkdown);
      existingFrontmatter = parsed.frontmatter;
      existingBody = parsed.body;
    }

    // 2. Smart skip: no source code changes → return existing as-is
    if (existingMarkdown && !process.env.FORCE_REGENERATE) {
      const previousSources = this.sourceReader.extractSourceTrace(existingMarkdown);
      if (previousSources.length > 0 && !this.sourceReader.hasSourcesChanged(previousSources)) {
        log.info("Smart skip: no source changes", { filePath: topic.filePath });
        return {
          filePath: topic.filePath,
          title: topic.title,
          markdown: existingMarkdown,
          html: "",
          sourceFiles: previousSources,
          isNew: false,
        };
      }
    }

    // 3. Gather source code context
    const sourceCode = this.sourceReader.findSourceContext(topic.searchTerms, topic.entryPoints);
    const navIndex = this.sourceReader.buildNavIndex();

    // 4. Read existing Intercom articles + conversations
    const existingIntercomContent = this.findRelevantExistingArticles(topic);
    const conversationContext = this.readConversations(topic);

    const combinedBusinessContext = [
      businessContext,
      conversationContext
        ? `## Real Support Conversations\nThese are actual questions founders asked and answers the team gave. Use these to understand what users struggle with and what language they use.\n\n${conversationContext}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    // 5. Build prompt (pass full topic object, not just title)
    const userPrompt = buildArticlePrompt({
      topic,
      sourceCode: navIndex + "\n\n" + sourceCode,
      existingMarkdown: existingBody || undefined,
      existingFrontmatter: existingFrontmatter || undefined,
      existingIntercomContent: existingIntercomContent || undefined,
      businessContext: combinedBusinessContext || undefined,
    });

    const model = anthropic(config.model);

    log.info("Calling LLM", {
      filePath: topic.filePath,
      model: config.model,
      contextSize: userPrompt.length,
      hasExistingArticle: !!existingBody,
      existingArticles: existingIntercomContent ? "yes" : "none",
    });

    const result = await generateText({
      model,
      messages: [
        { role: "system", content: DOC_AGENT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxSteps: 1,
    });

    let generatedBody = result.text.trim();

    // 6. Strip accidental frontmatter the LLM may have produced
    generatedBody = ArticleGenerator.stripAccidentalFrontmatter(generatedBody);

    // 7. Validate and fix body
    const { cleaned, warnings } = ArticleGenerator.validateBody(generatedBody, topic);
    if (warnings.length > 0) {
      log.warn("Post-generation fixes applied", { filePath: topic.filePath, warnings });
    }

    // 8. Extract source files from context markers
    const sourceFilePattern = /---\s+([a-zA-Z0-9_-]+\/[^\s]+)\s+---/g;
    const sourceFiles: string[] = [];
    let match;
    while ((match = sourceFilePattern.exec(sourceCode)) !== null) {
      sourceFiles.push(match[1]);
    }

    // 9. Build updated frontmatter
    const changelogSummary = existingBody
      ? "Updated by doc-agent based on source code changes."
      : "Generated by doc-agent from source code context.";
    const updatedFrontmatter = ArticleGenerator.mergeFrontmatter(topic, existingFrontmatter, changelogSummary);
    const frontmatterYaml = ArticleGenerator.serializeFrontmatter(updatedFrontmatter);

    // 10. Append source trace and assemble full Markdown
    const sourceTrace = sourceFiles.length > 0 ? `\n\n<!-- Sources: ${sourceFiles.join(", ")} -->` : "";
    const fullMarkdown = `${frontmatterYaml}\n\n${cleaned}${sourceTrace}\n`;

    log.info(`Article generated in ${Date.now() - startTime}ms`, {
      filePath: topic.filePath,
      length: fullMarkdown.length,
      sources: sourceFiles.length,
      warnings: warnings.length,
    });

    return {
      filePath: topic.filePath,
      title: topic.title,
      markdown: fullMarkdown,
      html: "",
      sourceFiles,
      isNew: !manifestEntry?.intercom_article_id,
    };
  }
}
