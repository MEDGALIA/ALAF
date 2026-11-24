// Repo constants for the VT Radar curator UI. (#36)
export const REPO_OWNER = "MEDGALIA";
export const REPO_NAME = "ALAF";
export const DEFAULT_BRANCH = "main";
export const DATA_DIR = "data/json";
export const DICTIONARY_FILE = "dictionary.json";
export const SUMMARIES_DIR = "data/summaries";

// Reads go here: no rate limit and CORS-enabled for public repos, unlike the
// 60/hour unauthenticated REST API. Writes still use the API. (#36)
export const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;

// JSON filename stem per data sheet, matches radar_sync_common.slugify().
export const SHEETS = {
  Knowledgebase: "knowledgebase",
  Deprecated: "deprecated",
  "SOTA Coding Agents Benchmarks": "sota_coding_agents_benchmarks",
};

export const DEFAULT_SHEET = "Knowledgebase";

export const SHEET_LABELS = {
  Knowledgebase: "Knowledgebase",
  Deprecated: "Deprecated",
  "SOTA Coding Agents Benchmarks": "SOTA Benchmarks",
};

// Written by the sync pipeline, never editable in the form.
export const AUTO_MANAGED_FIELDS = [
  "id",
  "added_edited_by",
  "last_updated",
  "verified_by",
  "last_verified",
];

export const VERIFY_WORKFLOW_FILE = "verify-rows.yml";

// Verification older than this is flagged stale in the table.
export const STALE_VERIFICATION_DAYS = 365;

export const TOKEN_HELP_URL =
  "https://github.com/settings/personal-access-tokens/new";
