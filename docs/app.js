// VT Radar curator/admin UI. Option C (table + side drawer). No build step,
// no framework, and no xlsx<->json conversion logic here. (#36)
import {
  DEFAULT_BRANCH,
  DATA_DIR,
  SHEETS,
  SHEET_LABELS,
  DEFAULT_SHEET,
  SUMMARIES_DIR,
  VERIFY_WORKFLOW_FILE,
  STALE_VERIFICATION_DAYS,
  TOKEN_HELP_URL,
} from "./config.js";
import * as gh from "./github-api.js";
import { parseFrontMatter, renderMarkdown } from "./markdown.js";
import {
  loadDictionary,
  groupedEditableFields,
  autoManagedFields,
  isMultiLine,
  termList,
  sameValue,
} from "./schema.js";
import {
  $,
  $$,
  escapeHtml,
  renderLoading,
  renderEmpty,
  renderError,
  toast,
  withBusy,
  openDrawer,
  closeDrawer,
  debounce,
} from "./ui.js";

const state = {
  dictionary: null,
  sheets: {},
  staged: new Map(), // "sheet::id" -> record
  summaries: new Map(), // row id -> summary filename
  stagedSummaries: new Map(), // row id -> pending summary file
  selected: new Set(), // "sheet::id" for verification
  user: null,
  canWrite: false,
  // Knowledgebase is the sheet curators work in, so it is the default scope
  // rather than an unfiltered mix of all three. (#36)
  filters: { search: "", sheet: DEFAULT_SHEET, type: "", maturity: "", needsVerification: false, hasSummary: false },
  sort: { key: "resource_name", dir: "asc" },
};

const rowKey = (sheetName, id) => `${sheetName}::${id}`;

const safeUrl = (value) => (/^https?:\/\//i.test(String(value || "").trim()) ? String(value).trim() : "");

const hasSummary = (id) => state.summaries.has(id) || state.stagedSummaries.has(id);

const todayIso = () => new Date().toISOString().slice(0, 10);

// Matches drafts/Summaries.md: id first, then the name with every character
// outside A-Za-z0-9_ replaced by an underscore.
const summaryFilename = (record) =>
  `${record.id}_${String(record.resource_name || "").replace(/[^A-Za-z0-9_]/g, "_")}.md`;

function summaryFileText(entry) {
  const { record, body, summarizedBy, summarizedDate } = entry;
  // reviewed_by stays empty: the approving reviewer is stamped on merge by
  // stamp-verification.yml, the same rule rows already follow. (#36)
  return [
    "---",
    `id: ${record.id}`,
    `resource_name: ${record.resource_name || ""}`,
    `url: ${record.url || ""}`,
    `summarized_date: ${summarizedDate}`,
    `summarized_by: ${summarizedBy}`,
    "reviewed_by:",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

// Arrays render as "a, b" rather than JavaScript's comma-joined default.
const displayValue = (value) =>
  Array.isArray(value) ? value.join(", ") || "(none)" : value || "(none)";

// ---- Verification status ---------------------------------------------------

function verificationStatus(record) {
  if (!record.verified_by || !record.last_verified) return { level: "unverified", label: "Unverified" };
  const verified = Date.parse(record.last_verified);
  if (Number.isNaN(verified)) return { level: "verified", label: "Verified" };
  const ageDays = (Date.now() - verified) / 86_400_000;
  if (ageDays > STALE_VERIFICATION_DAYS) return { level: "stale", label: "Stale" };
  return { level: "verified", label: "Verified" };
}

// ---- Auth ------------------------------------------------------------------

async function applyToken() {
  const repo = await gh.getRepo();
  state.user = await gh.getAuthenticatedUser();
  state.canWrite = Boolean(repo.permissions?.push || repo.permissions?.admin);
  document.body.classList.toggle("can-write", state.canWrite);
  renderAuth();
}

function signOut() {
  gh.clearToken();
  state.user = null;
  state.canWrite = false;
  state.selected.clear();
  state.staged.clear();
  state.stagedSummaries.clear();
  document.body.classList.remove("can-write");
  renderAuth();
  renderTable();
  renderStaged();
  renderApprovals();
}

function renderAuth() {
  const el = $("#auth");
  if (state.user) {
    el.innerHTML = `
      <span class="auth__user">
        <img class="auth__avatar" src="${escapeHtml(state.user.avatar_url)}&s=48" alt="" width="24" height="24" />
        <span>${escapeHtml(state.user.login)}</span>
        ${state.canWrite ? `<span class="badge badge--ok">Can edit</span>` : `<span class="badge">Read-only</span>`}
      </span>
      <button type="button" class="btn btn--ghost" id="sign-out">Sign out</button>`;
    $("#sign-out").addEventListener("click", signOut);
  } else {
    el.innerHTML = `<button type="button" class="btn btn--primary" id="sign-in">Sign in to edit</button>`;
    $("#sign-in").addEventListener("click", openSignInDialog);
  }
}

function openSignInDialog() {
  const dialog = $("#signin-dialog");
  dialog.showModal();
  $("#pat-input").value = "";
  $("#pat-error").hidden = true;
  $("#pat-input").focus();
}

async function submitToken(event) {
  event.preventDefault();
  const input = $("#pat-input");
  const token = input.value.trim();
  if (!token) return;
  const errorEl = $("#pat-error");
  errorEl.hidden = true;
  const button = $("#pat-submit");
  await withBusy(button, "Checking…", async () => {
    gh.setToken(token);
    try {
      await applyToken();
      $("#signin-dialog").close();
      toast(`Signed in as ${state.user.login}`, { type: "success" });
      renderTable();
      renderApprovals();
    } catch (err) {
      gh.clearToken();
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

// ---- Data ------------------------------------------------------------------

async function loadAllData() {
  const host = $("#table-region");
  renderLoading(host, "Loading radar data…");
  try {
    state.dictionary = await loadDictionary();
    const entries = await Promise.all(
      Object.entries(SHEETS).map(async ([sheetName, slug]) => {
        const data = await gh.fetchRawJson(`${DATA_DIR}/${slug}.json`, DEFAULT_BRANCH);
        return [sheetName, data];
      })
    );
    state.sheets = Object.fromEntries(entries);
    await loadSummaryIndex();
    buildFilterOptions();
    renderTable();
  } catch (err) {
    renderError(host, err.message, () => loadAllData());
  }
}

// Summary files are named "<id>_<resource name>.md", so the id prefix maps a
// file to its row without storing a link on the row itself. (#36)
async function loadSummaryIndex() {
  try {
    const files = await gh.listDirectory(SUMMARIES_DIR, DEFAULT_BRANCH);
    state.summaries = new Map(
      files
        .filter((f) => f.type === "file" && f.name.endsWith(".md"))
        .map((f) => [f.name.split("_")[0], f.name])
    );
  } catch {
    // Listing needs the REST API, which anonymous callers can exhaust. The
    // rest of the page works without it, so leave the index empty.
    state.summaries = new Map();
  }
}

function allRows() {
  return Object.entries(state.sheets).flatMap(([sheetName, data]) =>
    (data.records || []).map((record) => ({ sheetName, record }))
  );
}

function visibleRows() {
  const { search, sheet, type, maturity, needsVerification, hasSummary: summaryOnly } = state.filters;
  const needle = search.trim().toLowerCase();
  let rows = allRows().filter(({ sheetName, record }) => {
    if (sheet && sheetName !== sheet) return false;
    if (type && record.resource_type !== type) return false;
    if (maturity && record.maturity_level !== maturity) return false;
    if (needsVerification && verificationStatus(record).level === "verified") return false;
    if (summaryOnly && !hasSummary(record.id)) return false;
    if (!needle) return true;
    return `${record.resource_name ?? ""} ${record.url ?? ""} ${record.source_organization ?? ""}`
      .toLowerCase()
      .includes(needle);
  });
  const { key, dir } = state.sort;
  const sign = dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const av = key === "sheet" ? a.sheetName : a.record[key] ?? "";
    const bv = key === "sheet" ? b.sheetName : b.record[key] ?? "";
    return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * sign;
  });
}

function buildFilterOptions() {
  const types = new Set();
  const maturities = new Set();
  for (const { record } of allRows()) {
    if (record.resource_type) types.add(record.resource_type);
    if (record.maturity_level) maturities.add(record.maturity_level);
  }
  fillSelect($("#filter-sheet"), Object.keys(SHEETS).map((s) => [s, SHEET_LABELS[s]]), "All sheets");
  $("#filter-sheet").value = state.filters.sheet;
  fillSelect($("#filter-type"), [...types].sort().map((t) => [t, t]), "All types");
  fillSelect($("#filter-maturity"), [...maturities].sort().map((m) => [m, m]), "All maturity levels");
}

function fillSelect(el, pairs, allLabel) {
  el.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    pairs.map(([v, label]) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`).join("");
}

// ---- Table -----------------------------------------------------------------

function renderTable() {
  const host = $("#table-region");
  const rows = visibleRows();
  const total = allRows().length;

  const sheet = state.filters.sheet;
  $("#sheet-label").textContent = sheet ? SHEET_LABELS[sheet] || sheet : "All sheets";
  $("#row-count").textContent = total === 0 ? "" : `${rows.length} of ${total} rows`;

  if (total === 0) {
    renderEmpty(host, { title: "No radar data loaded." });
    return;
  }
  if (rows.length === 0) {
    renderEmpty(host, {
      title: "No rows match these filters.",
      hint: "Clear the search box or reset the filters to see the full radar.",
    });
    return;
  }

  const showVerify = state.canWrite;
  host.innerHTML = `
    <table class="table">
      <caption class="sr-only">VT Radar resources, ${rows.length} shown of ${total}</caption>
      <thead>
        <tr>
          ${showVerify ? `<th scope="col" class="col-check"><span class="sr-only">Select for verification</span></th>` : ""}
          ${sortableHeader("resource_name", "Resource")}
          ${sortableHeader("source_organization", "Organization")}
          ${sortableHeader("resource_type", "Type")}
          ${sortableHeader("maturity_level", "Maturity")}
          ${sortableHeader("last_verified", "Verification")}
        </tr>
      </thead>
      <tbody>${rows.map((row) => renderRow(row, showVerify)).join("")}</tbody>
    </table>`;

  $$("[data-sort]", host).forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      state.sort =
        state.sort.key === key
          ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" }
          : { key, dir: "asc" };
      renderTable();
    })
  );
  $$("[data-open]", host).forEach((btn) =>
    btn.addEventListener("click", () => {
      const [sheetName, id] = btn.dataset.open.split("::");
      const record = state.sheets[sheetName].records.find((r) => r.id === id);
      if (record) showDrawer(sheetName, record);
    })
  );
  $$("[data-summary]", host).forEach((btn) =>
    btn.addEventListener("click", () => {
      const [sheetName, id] = btn.dataset.summary.split("::");
      const record = state.sheets[sheetName].records.find((r) => r.id === id);
      if (record) showDrawer(sheetName, record, { expandSummary: true });
    })
  );
  $$(".row-check", host).forEach((box) =>
    box.addEventListener("change", () => {
      if (box.checked) state.selected.add(box.dataset.key);
      else state.selected.delete(box.dataset.key);
      renderVerifyBar();
    })
  );
  renderVerifyBar();
}

function sortableHeader(key, label) {
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir === "asc" ? "▲" : "▼") : "";
  return `<th scope="col" aria-sort="${active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none"}">
    <button type="button" class="th-sort" data-sort="${key}">${escapeHtml(label)}<span class="th-sort__arrow">${arrow}</span></button>
  </th>`;
}

function renderRow({ sheetName, record }, showVerify) {
  const key = rowKey(sheetName, record.id);
  const status = verificationStatus(record);
  const staged = state.staged.has(key);
  return `<tr class="${staged ? "row--staged" : ""}">
    ${
      showVerify
        ? `<td class="col-check"><input type="checkbox" class="row-check" data-key="${escapeHtml(key)}"
             ${state.selected.has(key) ? "checked" : ""}
             aria-label="Select ${escapeHtml(record.resource_name || record.id)} for verification" /></td>`
        : ""
    }
    <td>
      <button type="button" class="link-btn" data-open="${escapeHtml(key)}">${escapeHtml(record.resource_name || "(untitled)")}</button>
      ${staged ? `<span class="badge badge--staged">Staged</span>` : ""}
      ${
        // Only when viewing every sheet at once, since the column is gone.
        state.filters.sheet ? "" : `<span class="badge">${escapeHtml(SHEET_LABELS[sheetName] || sheetName)}</span>`
      }
      ${
        hasSummary(record.id)
          ? `<button type="button" class="badge badge--summary" data-summary="${escapeHtml(key)}"
               aria-label="Open summary for ${escapeHtml(record.resource_name || record.id)}">Summary${
                 state.stagedSummaries.has(record.id) ? " (staged)" : ""
               }</button>`
          : ""
      }
    </td>
    <td>${escapeHtml(record.source_organization || "")}</td>
    <td>${escapeHtml(record.resource_type || "")}</td>
    <td>${escapeHtml(record.maturity_level || "")}</td>
    <td>
      <span class="pill pill--${status.level}">${escapeHtml(status.label)}</span>
      <div class="cell-sub">${escapeHtml(record.verified_by || "")}${record.last_verified ? ` · ${escapeHtml(record.last_verified)}` : ""}</div>
    </td>
  </tr>`;
}

// ---- Drawer ----------------------------------------------------------------

function showDrawer(sheetName, record, { expandSummary = false } = {}) {
  const key = rowKey(sheetName, record.id);
  const current = state.staged.get(key)?.record ?? record;
  const groups = groupedEditableFields(state.dictionary, sheetName);
  const auto = autoManagedFields(state.dictionary, sheetName);
  const drawer = $("#drawer");
  // Signed-out visitors read the row but cannot stage work they could never
  // submit, the pull request call would only fail with a 401. (#36)
  const readOnly = !state.canWrite;

  drawer.innerHTML = `
    <header class="drawer__head">
      <div>
        <p class="drawer__eyebrow">${escapeHtml(SHEET_LABELS[sheetName] || sheetName)}</p>
        <h2 id="drawer-title">${escapeHtml(record.resource_name || "(untitled)")}</h2>
      </div>
      <button type="button" class="btn btn--ghost" id="drawer-close" aria-label="Close editor">×</button>
    </header>
    <div class="drawer__body">
    ${summarySection(record, expandSummary)}
    <form id="drawer-form">
      ${groups
        .map(
          (group) => `<fieldset class="group" ${readOnly ? "disabled" : ""}>
            <legend>${escapeHtml(group.title)}</legend>
            ${group.fields.map((f) => renderField(f, current[f.key])).join("")}
          </fieldset>`
        )
        .join("")}
      <fieldset class="group group--readonly">
        <legend>Managed by the sync pipeline</legend>
        <dl class="auto-list">
          ${auto
            .map(
              (f) => `<div><dt>${escapeHtml(f.name)}</dt><dd>${escapeHtml(current[f.key] || "(none)")}</dd></div>`
            )
            .join("")}
        </dl>
      </fieldset>
    </form>
    </div>
    <footer class="drawer__foot">
      ${
        readOnly
          ? `<p class="drawer__note">Sign in to edit this resource.</p>
             <button type="button" class="btn btn--ghost" id="drawer-cancel">Close</button>
             <button type="button" class="btn btn--primary" id="drawer-signin">Sign in to edit</button>`
          : `<button type="button" class="btn btn--ghost" id="drawer-cancel">Cancel</button>
             <button type="button" class="btn btn--primary" id="drawer-stage">Stage edit</button>`
      }
    </footer>`;

  openDrawer();
  wireUrlField($("#drawer-form"));
  wireSummary(record, sheetName, expandSummary);
  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#drawer-cancel").addEventListener("click", closeDrawer);
  if (readOnly) {
    $("#drawer-signin").addEventListener("click", () => {
      closeDrawer();
      openSignInDialog();
    });
  } else {
    $("#drawer-stage").addEventListener("click", () => stageEdit(sheetName, record));
  }
}

// Reference material while verifying a row, so it sits above the form but
// stays collapsed: the body runs to a page or two. Signed-in curators can
// write one where none exists, or edit the existing text. (#36)
function summarySection(record, expanded) {
  const file = state.summaries.get(record.id);
  const staged = state.stagedSummaries.get(record.id);

  if (!file && !staged) {
    if (!state.canWrite) return "";
    return `<div class="summary summary--empty" id="summary-block">
      <p class="summary__none">No summary yet.</p>
      <button type="button" class="btn btn--secondary btn--sm" id="summary-write">Write summary</button>
    </div>`;
  }

  return `<details class="summary" id="summary-block" ${expanded || staged ? "open" : ""}>
    <summary class="summary__toggle">
      <span class="summary__label">Summary</span>
      ${staged ? `<span class="badge badge--staged">Staged</span>` : ""}
      <span class="summary__meta" id="summary-meta"></span>
    </summary>
    <div class="summary__body" id="summary-body"></div>
  </details>`;
}

function wireSummary(record, sheetName, expanded) {
  const file = state.summaries.get(record.id);
  const staged = state.stagedSummaries.get(record.id);

  if (!file && !staged) {
    $("#summary-write")?.addEventListener("click", () => openSummaryEditor(record, sheetName, ""));
    return;
  }

  const block = $("#summary-block");
  let loaded = false;

  const load = async () => {
    if (loaded) return;
    loaded = true;
    const body = $("#summary-body");
    if (staged) {
      showSummaryView(record, sheetName, staged.body, {
        summarized_by: staged.summarizedBy,
        summarized_date: staged.summarizedDate,
      });
      return;
    }
    renderLoading(body, "Loading summary…");
    try {
      const text = await gh.fetchRawText(`${SUMMARIES_DIR}/${file}`, DEFAULT_BRANCH);
      const { meta, body: markdown } = parseFrontMatter(text);
      showSummaryView(record, sheetName, markdown, meta);
    } catch (err) {
      loaded = false;
      renderError(body, err.message);
    }
  };

  block.addEventListener("toggle", () => {
    if (block.open) load();
  });
  if (expanded || staged) load();
}

function summaryByline(meta) {
  return [
    meta.summarized_by ? `Summarized by ${meta.summarized_by}` : "",
    meta.reviewed_by ? `reviewed by ${meta.reviewed_by}` : "",
    meta.summarized_date || "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function showSummaryView(record, sheetName, markdown, meta) {
  const file = state.summaries.get(record.id);
  $("#summary-meta").textContent = summaryByline(meta);
  $("#summary-body").innerHTML = `
    ${renderMarkdown(markdown)}
    <p class="summary__source">
      ${
        file
          ? `<a href="${gh.repoUrl()}/blob/${DEFAULT_BRANCH}/${SUMMARIES_DIR}/${encodeURIComponent(file)}"
               target="_blank" rel="noopener">View the summary file on GitHub</a>`
          : ""
      }
    </p>
    ${state.canWrite ? `<button type="button" class="btn btn--secondary btn--sm" id="summary-edit">Edit summary</button>` : ""}`;
  $("#summary-edit")?.addEventListener("click", () => openSummaryEditor(record, sheetName, markdown));
}

// Write and Preview as tabs rather than a split pane: the drawer is ~520px,
// which is too narrow to halve. Preview uses the viewer's own renderer.
function openSummaryEditor(record, sheetName, markdown) {
  const block = $("#summary-block");
  if (block.tagName === "DETAILS") block.open = true;

  const host = block.tagName === "DETAILS" ? $("#summary-body") : block;
  host.innerHTML = `
    <div class="editor">
      <div class="editor__tabs" role="tablist">
        <button type="button" class="editor__tab is-active" role="tab" aria-selected="true" data-tab="write">Write</button>
        <button type="button" class="editor__tab" role="tab" aria-selected="false" data-tab="preview">Preview</button>
      </div>
      <textarea id="summary-text" class="editor__text" rows="16"
        aria-label="Summary Markdown">${escapeHtml(markdown)}</textarea>
      <div id="summary-preview" class="editor__preview" hidden></div>
      <p class="field__hint">Saved as summarized_by ${escapeHtml(state.user?.login ? "@" + state.user.login : "you")}, ${todayIso()}. Front matter is written for you.</p>
      <div class="editor__actions">
        <button type="button" class="btn btn--ghost btn--sm" id="summary-cancel">Cancel</button>
        <button type="button" class="btn btn--primary btn--sm" id="summary-stage">Stage summary</button>
      </div>
    </div>`;

  const text = $("#summary-text");
  const preview = $("#summary-preview");
  $$(".editor__tab", host).forEach((tab) =>
    tab.addEventListener("click", () => {
      const showPreview = tab.dataset.tab === "preview";
      $$(".editor__tab", host).forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      if (showPreview) preview.innerHTML = renderMarkdown(text.value);
      preview.hidden = !showPreview;
      text.hidden = showPreview;
    })
  );

  $("#summary-cancel").addEventListener("click", () => showDrawer(sheetName, record, { expandSummary: true }));
  $("#summary-stage").addEventListener("click", () => stageSummary(record, sheetName, text.value));
}

function stageSummary(record, sheetName, body) {
  if (!body.trim()) {
    toast("Summary is empty, nothing to stage.", { type: "error" });
    return;
  }
  state.stagedSummaries.set(record.id, {
    sheetName,
    record,
    filename: state.summaries.get(record.id) || summaryFilename(record),
    body: body.trim(),
    summarizedBy: `@${state.user.login}`,
    summarizedDate: todayIso(),
  });
  renderStaged();
  renderTable();
  closeDrawer();
  toast(`Summary staged for "${record.resource_name}".`, { type: "success" });
}

function renderField(field, value) {
  const id = `f-${field.key}`;
  const hint = field.description
    ? `<p class="field__hint" id="${id}-hint">${escapeHtml(field.description)}</p>`
    : "";
  const describedBy = field.description ? ` aria-describedby="${id}-hint"` : "";

  // A checkbox group is labelled by a <span>, not a <label for>, which can only
  // point at a single control.
  if (field.value_type === "controlled_multi") {
    const selected = new Set(termList(value, field.separator || ";"));
    // Selected terms first, so what is set is visible without scrolling the
    // list. Ordered once at render, not on toggle, to avoid chips jumping.
    const chips = [...field.terms]
      .sort((a, b) => Number(selected.has(b.name)) - Number(selected.has(a.name)))
      .map(
        (t, i) => `<label class="chip">
          <input type="checkbox" id="${id}-${i}" value="${escapeHtml(t.name)}" ${selected.has(t.name) ? "checked" : ""} />
          <span>${escapeHtml(t.name)}</span>
        </label>`
      )
      .join("");
    return `<div class="field">
      <span class="field__label" id="${id}-label">${escapeHtml(field.name)}</span>${hint}
      <div class="chips" role="group" aria-labelledby="${id}-label" data-key="${escapeHtml(field.key)}">${chips}</div>
    </div>`;
  }

  let control;
  if (field.value_type === "controlled_single") {
    const options = field.terms
      .map((t) => `<option value="${escapeHtml(t.name)}" ${t.name === value ? "selected" : ""}>${escapeHtml(t.name)}</option>`)
      .join("");
    control = `<select id="${id}" data-key="${escapeHtml(field.key)}"${describedBy}><option value="">(none)</option>${options}</select>`;
  } else if (field.value_type === "date") {
    control = `<input type="date" id="${id}" data-key="${escapeHtml(field.key)}" value="${escapeHtml(value || "")}"${describedBy} />`;
  } else if (isMultiLine(field)) {
    control = `<textarea id="${id}" data-key="${escapeHtml(field.key)}" rows="4"${describedBy}>${escapeHtml(value || "")}</textarea>`;
  } else if (field.key === "url") {
    // Paired with an Open link so a curator can check the resource without
    // copying the value out of the field. (#36)
    const href = safeUrl(value);
    control = `<div class="field__row">
      <input type="url" id="${id}" data-key="${escapeHtml(field.key)}" value="${escapeHtml(value || "")}"${describedBy} />
      <a class="btn btn--ghost btn--sm field__open" id="${id}-open" href="${href || "#"}" target="_blank"
         rel="noopener" ${href ? "" : "hidden"} aria-label="Open this resource in a new tab">Open</a>
    </div>`;
  } else {
    control = `<input type="text" id="${id}" data-key="${escapeHtml(field.key)}" value="${escapeHtml(value || "")}"${describedBy} />`;
  }
  return `<div class="field"><label class="field__label" for="${id}">${escapeHtml(field.name)}</label>${hint}${control}</div>`;
}

function wireUrlField(form) {
  const input = form.querySelector('[data-key="url"]');
  const link = $("#f-url-open", form);
  if (!input || !link) return;
  input.addEventListener("input", () => {
    const href = safeUrl(input.value);
    link.hidden = !href;
    if (href) link.href = href;
  });
}

function readField(form, field) {
  if (field.value_type === "controlled_multi") {
    const group = form.querySelector(`.chips[data-key="${field.key}"]`);
    return $$('input[type="checkbox"]:checked', group).map((c) => c.value);
  }
  return form.querySelector(`[data-key="${field.key}"]`)?.value ?? "";
}

function stageEdit(sheetName, record) {
  const form = $("#drawer-form");
  const updated = { ...record };
  for (const group of groupedEditableFields(state.dictionary, sheetName)) {
    for (const field of group.fields) updated[field.key] = readField(form, field);
  }
  const changed = Object.keys(updated).some((k) => !sameValue(updated[k], record[k]));
  if (!changed) {
    toast("No changes to stage.", { type: "info" });
    closeDrawer();
    return;
  }
  state.staged.set(rowKey(sheetName, record.id), { sheetName, record: updated });
  closeDrawer();
  renderStaged();
  renderTable();
  toast(`Staged "${updated.resource_name}".`, { type: "success" });
}

// ---- Staged edits ----------------------------------------------------------

function renderStaged() {
  const host = $("#staged-region");
  const count = state.staged.size + state.stagedSummaries.size;
  $("#staged-count").textContent = count ? String(count) : "";
  if (count === 0) {
    renderEmpty(host, {
      title: "No staged edits.",
      hint: "Open a resource and choose Stage edit to batch changes into one pull request.",
    });
    return;
  }
  const rowItems = [...state.staged.entries()].map(
    ([key, { record }]) => `<li>
      <span>${escapeHtml(record.resource_name)}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-unstage="${escapeHtml(key)}" aria-label="Remove ${escapeHtml(record.resource_name)} from staged edits">Remove</button>
    </li>`
  );
  const summaryItems = [...state.stagedSummaries.entries()].map(
    ([id, { record }]) => `<li>
      <span><span class="staged-kind">Summary</span> ${escapeHtml(record.resource_name)}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-unstage-summary="${escapeHtml(id)}" aria-label="Remove the staged summary for ${escapeHtml(record.resource_name)}">Remove</button>
    </li>`
  );

  host.innerHTML = `
    <ul class="staged-list">${[...rowItems, ...summaryItems].join("")}</ul>
    <button type="button" class="btn btn--primary" id="submit-staged">Open pull request (${count})</button>`;
  $$("[data-unstage]", host).forEach((btn) =>
    btn.addEventListener("click", () => {
      state.staged.delete(btn.dataset.unstage);
      renderStaged();
      renderTable();
    })
  );
  $$("[data-unstage-summary]", host).forEach((btn) =>
    btn.addEventListener("click", () => {
      state.stagedSummaries.delete(btn.dataset.unstageSummary);
      renderStaged();
      renderTable();
    })
  );
  $("#submit-staged").addEventListener("click", (e) => submitStaged(e.currentTarget));
}

async function submitStaged(button) {
  await withBusy(button, "Opening pull request…", async () => {
    try {
      const rowCount = state.staged.size;
      const summaryCount = state.stagedSummaries.size;
      const branch = `ui-edit-${Date.now()}`;
      await gh.createBranch(branch, DEFAULT_BRANCH);

      const bySheet = {};
      for (const { sheetName, record } of state.staged.values()) {
        (bySheet[sheetName] ||= []).push(record);
      }

      for (const [sheetName, records] of Object.entries(bySheet)) {
        const path = `${DATA_DIR}/${SHEETS[sheetName]}.json`;
        // Re-read at write time so a stale page can't clobber newer rows.
        const { content, sha } = await gh.getFileWithSha(path, DEFAULT_BRANCH);
        const data = JSON.parse(content);
        const byId = new Map(data.records.map((r) => [r.id, r]));
        for (const r of records) byId.set(r.id, r);
        const updated = { ...data, records: [...byId.values()] };
        await gh.putFile({
          path,
          content: `${JSON.stringify(updated, null, 2)}\n`,
          message: `UI edit: ${records.length} row(s) in ${sheetName}`,
          branch,
          sha,
        });
      }

      for (const entry of state.stagedSummaries.values()) {
        const path = `${SUMMARIES_DIR}/${entry.filename}`;
        // An existing file needs its blob sha; a new one must not send one.
        let sha;
        try {
          ({ sha } = await gh.getFileWithSha(path, DEFAULT_BRANCH));
        } catch {
          sha = undefined;
        }
        await gh.putFile({
          path,
          content: summaryFileText(entry),
          message: `${sha ? "Update" : "Add"} summary for ${entry.record.resource_name}`,
          branch,
          sha,
        });
      }

      const pr = await gh.createPullRequest({
        title: summaryCount
          ? `UI edit: ${rowCount} row(s), ${summaryCount} summary file(s)`
          : `UI edit: ${rowCount} row(s)`,
        head: branch,
        base: DEFAULT_BRANCH,
        body: "Opened from the VT Radar curator UI.",
      });

      state.staged.clear();
      state.stagedSummaries.clear();
      renderStaged();
      renderTable();
      toast(`Pull request #${pr.number} opened.`, {
        type: "success",
        action: { label: "View PR", href: pr.html_url },
      });
      renderApprovals();
    } catch (err) {
      toast(err.message, { type: "error" });
    }
  });
}

// ---- Verification ----------------------------------------------------------

function renderVerifyBar() {
  const bar = $("#verify-bar");
  const count = state.selected.size;
  bar.hidden = count === 0;
  if (count === 0) return;
  bar.innerHTML = `
    <span>${count} row${count === 1 ? "" : "s"} selected</span>
    <button type="button" class="btn btn--ghost btn--sm" id="verify-clear">Clear</button>
    <button type="button" class="btn btn--primary btn--sm" id="verify-run">Mark verified</button>`;
  $("#verify-clear").addEventListener("click", () => {
    state.selected.clear();
    renderTable();
  });
  $("#verify-run").addEventListener("click", (e) => markVerified(e.currentTarget));
}

async function markVerified(button) {
  await withBusy(button, "Dispatching…", async () => {
    const bySheet = {};
    for (const key of state.selected) {
      const [sheetName, id] = key.split("::");
      (bySheet[SHEETS[sheetName]] ||= []).push(id);
    }
    try {
      for (const [slug, ids] of Object.entries(bySheet)) {
        await gh.dispatchWorkflow(VERIFY_WORKFLOW_FILE, DEFAULT_BRANCH, {
          sheet: slug,
          row_ids: ids.join(","),
        });
      }
      state.selected.clear();
      renderTable();
      toast("Verification dispatched. Reload in a minute to see the stamps.", {
        type: "success",
        action: { label: "View Actions", href: `${gh.repoUrl()}/actions` },
      });
    } catch (err) {
      toast(err.message, { type: "error" });
    }
  });
}

// ---- Approvals -------------------------------------------------------------

async function renderApprovals() {
  const host = $("#approvals-region");
  if (!state.canWrite) {
    renderEmpty(host, {
      title: "Sign in to review pull requests.",
      hint: "Reviewing and merging needs a token with write access.",
    });
    $("#approvals-count").textContent = "";
    return;
  }
  renderLoading(host, "Loading pull requests…");
  try {
    const prs = await gh.listOpenPullRequests(DEFAULT_BRANCH);
    const relevant = [];
    for (const pr of prs) {
      const files = await gh.getPullRequestFiles(pr.number);
      const dataFiles = files.filter(
        (f) => f.filename.startsWith(`${DATA_DIR}/`) && f.filename.endsWith(".json") && !f.filename.endsWith("dictionary.json")
      );
      if (dataFiles.length) relevant.push({ pr, dataFiles });
    }
    $("#approvals-count").textContent = relevant.length ? String(relevant.length) : "";
    if (relevant.length === 0) {
      renderEmpty(host, { title: "No pull requests awaiting review." });
      return;
    }
    host.innerHTML = relevant
      .map(
        ({ pr }) => `<article class="pr-card" data-pr="${pr.number}">
          <header class="pr-card__head">
            <h3><a href="${escapeHtml(pr.html_url)}" target="_blank" rel="noopener">#${pr.number} ${escapeHtml(pr.title)}</a></h3>
            <p class="cell-sub">by ${escapeHtml(pr.user.login)}</p>
          </header>
          <div class="pr-card__diff" data-diff="${pr.number}"></div>
          <footer class="pr-card__foot">
            <button type="button" class="btn btn--ghost btn--sm" data-reject="${pr.number}">Request changes</button>
            <button type="button" class="btn btn--primary btn--sm" data-approve="${pr.number}">Approve &amp; merge</button>
          </footer>
        </article>`
      )
      .join("");

    for (const { pr, dataFiles } of relevant) {
      renderDiff($(`[data-diff="${pr.number}"]`, host), pr, dataFiles);
    }
    $$("[data-approve]", host).forEach((btn) =>
      btn.addEventListener("click", () => approveAndMerge(btn, Number(btn.dataset.approve)))
    );
    $$("[data-reject]", host).forEach((btn) =>
      btn.addEventListener("click", () => requestChanges(btn, Number(btn.dataset.reject)))
    );
  } catch (err) {
    renderError(host, err.message, () => renderApprovals());
  }
}

async function renderDiff(container, pr, dataFiles) {
  renderLoading(container, "Building diff…");
  try {
    const blocks = [];
    for (const file of dataFiles) {
      let base = { records: [] };
      try {
        base = await gh.fetchRawJson(file.filename, pr.base.sha);
      } catch {
        // New file on this branch; treat every row as added.
      }
      const head = await gh.fetchRawJson(file.filename, pr.head.sha);
      const baseById = new Map((base.records || []).map((r) => [r.id, r]));
      for (const row of head.records || []) {
        const prev = baseById.get(row.id);
        if (!prev) {
          blocks.push(`<p class="diff-row"><strong>${escapeHtml(row.resource_name)}</strong> <span class="pill pill--new">new</span></p>`);
          continue;
        }
        const changed = Object.keys(row).filter(
          (k) => k !== "_content_hash" && !sameValue(row[k], prev[k])
        );
        if (!changed.length) continue;
        blocks.push(`<div class="diff-row">
          <strong>${escapeHtml(row.resource_name)}</strong>
          <ul>${changed
            .map(
              (k) => `<li><code>${escapeHtml(k)}</code>
                <del>${escapeHtml(displayValue(prev[k]))}</del> <ins>${escapeHtml(displayValue(row[k]))}</ins></li>`
            )
            .join("")}</ul>
        </div>`);
      }
    }
    container.innerHTML = blocks.join("") || `<p class="cell-sub">No field-level changes detected.</p>`;
  } catch (err) {
    renderError(container, err.message);
  }
}

async function approveAndMerge(button, number) {
  await withBusy(button, "Approving…", async () => {
    try {
      await gh.createReview(number, "APPROVE");
    } catch (err) {
      // GitHub blocks self-approval, surface it rather than failing silently.
      toast(`Approval failed: ${err.message}`, { type: "error" });
      return;
    }
    try {
      await gh.mergePullRequest(number);
      toast(`Pull request #${number} merged.`, { type: "success" });
      renderApprovals();
    } catch (err) {
      toast(`Approved, but merge failed: ${err.message}`, { type: "error" });
    }
  });
}

async function requestChanges(button, number) {
  const body = prompt("What needs changing?");
  if (body === null) return;
  await withBusy(button, "Sending…", async () => {
    try {
      await gh.createReview(number, "REQUEST_CHANGES", body);
      toast(`Changes requested on #${number}.`, { type: "success" });
      renderApprovals();
    } catch (err) {
      toast(err.message, { type: "error" });
    }
  });
}

// ---- Wiring ----------------------------------------------------------------

function wireControls() {
  $("#search").addEventListener(
    "input",
    debounce((e) => {
      state.filters.search = e.target.value;
      renderTable();
    }, 200)
  );
  $("#filter-sheet").addEventListener("change", (e) => {
    state.filters.sheet = e.target.value;
    renderTable();
  });
  $("#filter-type").addEventListener("change", (e) => {
    state.filters.type = e.target.value;
    renderTable();
  });
  $("#filter-maturity").addEventListener("change", (e) => {
    state.filters.maturity = e.target.value;
    renderTable();
  });
  $("#filter-needs-verification").addEventListener("change", (e) => {
    state.filters.needsVerification = e.target.checked;
    renderTable();
  });
  $("#filter-has-summary").addEventListener("change", (e) => {
    state.filters.hasSummary = e.target.checked;
    renderTable();
  });
  $("#filters-reset").addEventListener("click", () => {
    state.filters = { search: "", sheet: DEFAULT_SHEET, type: "", maturity: "", needsVerification: false, hasSummary: false };
    $("#search").value = "";
    $("#filter-sheet").value = DEFAULT_SHEET;
    $("#filter-type").value = "";
    $("#filter-maturity").value = "";
    $("#filter-needs-verification").checked = false;
    $("#filter-has-summary").checked = false;
    renderTable();
  });
  $("#overlay").addEventListener("click", closeDrawer);
  $("#signin-form").addEventListener("submit", submitToken);
  $("#signin-cancel").addEventListener("click", () => $("#signin-dialog").close());
  $("#token-help").href = TOKEN_HELP_URL;
}

async function main() {
  wireControls();
  renderStaged();

  if (gh.hasToken()) {
    try {
      await applyToken();
    } catch {
      gh.clearToken();
      renderAuth();
    }
  } else {
    renderAuth();
  }

  await loadAllData();
  renderApprovals();
}

main().catch((err) => {
  renderError($("#table-region"), err.message, () => location.reload());
  console.error(err);
});
