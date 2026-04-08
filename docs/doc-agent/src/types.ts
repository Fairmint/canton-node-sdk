/** Sync manifest entry for a single article */
export interface ManifestEntry {
  intercom_article_id: string;
  last_synced_checksum: string;
  collection: string;
  collection_id?: string;
}

/** The full sync manifest mapping file paths to Intercom state */
export type SyncManifest = Record<string, ManifestEntry>;

/** Intercom article as returned by the Articles API */
export interface IntercomArticle {
  id: string;
  title: string;
  body: string;
  state: "draft" | "published";
  parent_id?: string | null;
  parent_type?: string;
  author_id?: string;
  url?: string;
  created_at?: number;
  updated_at?: number;
}

/** Intercom collection */
export interface IntercomCollection {
  id: string;
  name: string;
  description?: string;
  parent_id?: string | null;
  order?: number;
  url?: string;
}

/** Result of generating a single article */
export interface ArticleGenerationResult {
  filePath: string;
  title: string;
  markdown: string;
  html: string;
  sourceFiles: string[];
  isNew: boolean;
  previousChecksum?: string;
}

/** Result of publishing a single article to Intercom */
export interface PublishResult {
  filePath: string;
  intercomArticleId: string;
  action: "created_draft" | "updated" | "skipped" | "aborted_manual_edit";
  checksum: string;
  message: string;
}

/** Article topic definition */
export interface ArticleTopic {
  filePath: string;
  title: string;
  /** Section label matching frontmatter (e.g., "3. Cap Table") */
  section: string;
  /** Article number within section (e.g., "3.4") */
  number: string;
  /** Audience: "Founders" or "Shared" */
  audience: "Founders" | "Shared";
  /** Gate description for frontmatter (when the feature is visible) */
  gate: string;
  /** Collection name for Intercom grouping */
  collection: string;
  searchTerms: string[];
  /** Guaranteed source files to include at highest priority (repo/path format) */
  entryPoints?: string[];
  existingIntercomTitle?: string;
}

/** Parsed YAML frontmatter from an article */
export interface ArticleFrontmatter {
  title: string;
  section: string;
  number: string;
  status: string;
  audience: string;
  gate: string;
  intercom_id?: string;
  intercom_state?: string;
  intercom_created_at?: string;
  intercom_updated_at?: string;
  intercom_updated_by?: string;
  github_created_at: string;
  github_created_by: string;
  github_updated_at: string;
  github_updated_by: string;
  changelog: Array<{ date: string; by: string; summary: string }>;
  [key: string]: unknown;
}

/** Fin analytics: unresolved question cluster */
export interface UnresolvedCluster {
  topic: string;
  count: number;
  sampleQuestions: string[];
}

/** Weekly digest data */
export interface WeeklyDigest {
  totalConversations: number;
  resolvedCount: number;
  unresolvedCount: number;
  resolutionRate: number;
  unresolvedClusters: UnresolvedCluster[];
  articlesNeedingAttention: string[];
}

/** Result of a full agent run */
export interface DocAgentRunResult {
  articlesProcessed: number;
  articlesPublished: number;
  articlesSkipped: number;
  articlesFailed: number;
  errors: string[];
  duration: number;
}
