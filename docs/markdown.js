// Minimal Markdown renderer for row summaries. Covers only what the summary
// files use: front matter, headings, lists, bold, italic, code, links. (#36)
import { escapeHtml } from "./ui.js";

// Splits a leading `---` block into key/value pairs plus the remaining body.
export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (pair) meta[pair[1]] = pair[2].trim();
  }
  return { meta, body: text.slice(match[0].length) };
}

// Blocks HTML and javascript: URLs; everything is escaped before this runs.
// In-document fragments are allowed so the checklist's cross references work;
// they stay same-tab and are intercepted by the reader panel. (#40)
function safeHref(url) {
  const u = url.trim();
  if (/^#[A-Za-z0-9_-]+$/.test(u)) return u;
  return /^(https?:|mailto:)/i.test(u) ? u : "";
}

// GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens.
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function inline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, url) => {
      const href = safeHref(url);
      if (!href) return whole;
      const external = !href.startsWith("#");
      const attrs = external ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${href}"${attrs}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    // Last, so an escaped asterisk is never read as emphasis. (#40)
    .replace(/\\([*_`[\]()#\\])/g, "$1");
}

// A GFM pipe table: header row, delimiter row, then body rows.
function renderTable(rows) {
  const cells = (row) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
  const tr = body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="md-table"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function isTableDelimiter(line) {
  return /^\|[\s:|-]+\|$/.test(line) && line.includes("-");
}

export function renderMarkdown(md) {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out = [];
  let list = null; // "ul" | "ol"
  let para = [];
  let table = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const closePara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  // A pipe run is only a table with a delimiter row; otherwise it is text.
  const closeTable = () => {
    if (!table.length) return;
    if (table.length >= 2 && isTableDelimiter(table[1])) out.push(renderTable(table));
    else table.forEach((row) => out.push(`<p>${inline(row)}</p>`));
    table = [];
  };
  const closeAll = () => {
    closePara();
    closeList();
    closeTable();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeAll();
      continue;
    }

    if (trimmed.startsWith("|")) {
      closePara();
      closeList();
      table.push(trimmed);
      continue;
    }
    closeTable();

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closePara();
      closeList();
      out.push("<hr>");
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closePara();
      closeList();
      const level = Math.min(heading[1].length + 2, 6); // page h1/h2 are taken
      // Id matches GitHub's slug so links written for github.com resolve here. (#40)
      out.push(`<h${level} id="${slug(heading[2])}">${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      closePara();
      const wanted = bullet ? "ul" : "ol";
      if (list !== wanted) {
        closeList();
        out.push(`<${wanted}${wanted === "ul" ? ' class="md-list"' : ""}>`);
        list = wanted;
      }
      const item = (bullet || numbered)[1];
      // Read-only task box: this repo's copy is the template, not an answer sheet. (#40)
      const task = /^\[([ xX])\]\s+(.*)$/.exec(item);
      if (task) {
        const checked = task[1].toLowerCase() === "x" ? " checked" : "";
        out.push(
          `<li class="md-task"><input type="checkbox" disabled${checked}> ${inline(task[2])}</li>`
        );
      } else {
        out.push(`<li>${inline(item)}</li>`);
      }
      continue;
    }

    closeList();
    para.push(trimmed);
  }
  closeAll();
  return out.join("\n");
}
