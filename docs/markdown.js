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
function safeHref(url) {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : "";
}

function inline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, url) => {
      const href = safeHref(url);
      return href ? `<a href="${href}" target="_blank" rel="noopener">${text}</a>` : whole;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(md) {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out = [];
  let list = null; // "ul" | "ol"
  let para = [];

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

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closePara();
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closePara();
      closeList();
      const level = Math.min(heading[1].length + 2, 6); // page h1/h2 are taken
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      closePara();
      const wanted = bullet ? "ul" : "ol";
      if (list !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        list = wanted;
      }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }

    closeList();
    para.push(trimmed);
  }
  closePara();
  closeList();
  return out.join("\n");
}
