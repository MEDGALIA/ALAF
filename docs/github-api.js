// GitHub REST client. No backend; calls go straight from the browser. (#36)
import { REPO_OWNER, REPO_NAME, RAW_BASE } from "./config.js";

const API = "https://api.github.com";
const TOKEN_KEY = "vt_radar_pat";

class ApiError extends Error {
  constructor(message, status, path) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function hasToken() {
  return Boolean(getToken());
}

function headers(extra = {}) {
  const h = { Accept: "application/vnd.github+json", ...extra };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// Turn GitHub's error payloads into something a curator can act on.
function describe(status, body, path) {
  if (status === 401) return "Token rejected. Sign out and paste a valid token.";
  if (status === 403 && /rate limit/i.test(body)) {
    return "GitHub rate limit reached. Sign in with a token to raise the limit.";
  }
  if (status === 403) return "Token lacks the permissions for this action.";
  if (status === 404 && path.includes("/actions/workflows/")) {
    // Workflows are only registered from the default branch, so a file that
    // exists on a feature branch still 404s here. (#36)
    return "Workflow not found. It must be merged to the default branch before it can be dispatched.";
  }
  if (status === 404) return `Not found: ${path}. Check the branch and repo.`;
  if (status === 409) return "Branch conflict. Reload to pick up the latest data.";
  if (status === 422) {
    const match = /"message":"([^"]+)"/.exec(body);
    return match ? match[1] : "GitHub rejected the request as invalid.";
  }
  return `GitHub returned ${status}.`;
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers: headers(options.headers) });
  } catch {
    throw new ApiError("Network error reaching GitHub.", 0, path);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(describe(res.status, body, path), res.status, path);
  }
  return res.status === 204 ? null : res.json();
}

// ---- Reads ---------------------------------------------------------------

export async function fetchRawJson(path, ref) {
  const url = `${RAW_BASE}/${encodeURIComponent(ref)}/${path}`;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ApiError("Network error reaching raw.githubusercontent.com.", 0, path);
  }
  if (!res.ok) throw new ApiError(describe(res.status, "", path), res.status, path);
  return res.json();
}

export async function fetchRawText(path, ref) {
  const res = await fetch(`${RAW_BASE}/${encodeURIComponent(ref)}/${path}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(describe(res.status, "", path), res.status, path);
  return res.text();
}

// Only way to discover which files exist; raw.githubusercontent cannot list a
// directory. One request, and the caller degrades gracefully if it fails.
export async function listDirectory(path, ref) {
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${encodeURIComponent(ref)}`);
}

function b64DecodeUnicode(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function b64EncodeUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// The blob sha is required to write a file back, so writes read via the API.
export async function getFileWithSha(path, ref) {
  const data = await request(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${encodeURIComponent(ref)}`
  );
  return { content: b64DecodeUnicode(data.content), sha: data.sha };
}

// ---- Auth ----------------------------------------------------------------

export async function getRepo() {
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}`);
}

export async function getAuthenticatedUser() {
  return request("/user");
}

// ---- Writes --------------------------------------------------------------

export async function putFile({ path, content, message, branch, sha }) {
  const body = { message, content: b64EncodeUnicode(content), branch };
  if (sha) body.sha = sha;
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createBranch(newBranch, fromBranch) {
  const ref = await request(`/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${fromBranch}`);
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: ref.object.sha }),
  });
}

export async function createPullRequest({ title, head, base, body }) {
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, head, base, body }),
  });
}

export async function listOpenPullRequests(base) {
  return request(
    `/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=50`
  );
}

export async function getPullRequestFiles(number) {
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${number}/files?per_page=100`);
}

export async function createReview(number, event, body = "") {
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${number}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, body }),
  });
}

export async function mergePullRequest(number) {
  return request(`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${number}/merge`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merge_method: "merge" }),
  });
}

export async function dispatchWorkflow(workflowFile, ref, inputs) {
  return request(
    `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, inputs }),
    }
  );
}

export function repoUrl() {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
}
