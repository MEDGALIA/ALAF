// Renders data/alaf/ALAF_CHECKLIST.md through docs/markdown.js and asserts each
// construct the checklist uses. Run after any change to markdown.js. (#40)
import { readFileSync } from "node:fs";

const repo = new URL("../../", import.meta.url);
const { parseFrontMatter, renderMarkdown, slug } = await import(
  new URL("docs/markdown.js", repo).href
);

const raw = readFileSync(new URL("data/alaf/ALAF_CHECKLIST.md", repo), "utf8");
const { meta, body } = parseFrontMatter(raw);
const html = renderMarkdown(body);

const count = (re) => (html.match(re) || []).length;
const checks = [];
const check = (name, cond, extra = "") => checks.push({ name, ok: !!cond, extra });

check("front matter parsed", meta.title === "ALAF Readiness Checklist");
check("front matter stripped from body", !body.startsWith("---"));
check("front matter keys absent from html", !html.includes("updated_by"));

check("task checkboxes rendered", count(/<input type="checkbox" disabled/g) === 14,
  String(count(/<input type="checkbox" disabled/g)));
check("no literal bracket syntax left", !html.includes("[ ] Yes"));
check("every task box is unchecked", !html.includes("disabled checked"));

check("tables rendered", count(/<table>/g) === 2, String(count(/<table>/g)));
check("no raw pipe rows", !/<p>\|/.test(html));
check("table header cells", html.includes("<th>Result</th>"));

check("rules rendered", count(/<hr>/g) === 9, String(count(/<hr>/g)));
check("no literal rule paragraphs", !html.includes("<p>---</p>"));

check("heading ids emitted", html.includes('id="access-granting-mechanisms-to-audit"'));
check("slug matches GitHub", slug("Appendix A: Glossary of Terms") === "appendix-a-glossary-of-terms",
  slug("Appendix A: Glossary of Terms"));
check("anchor link kept and same-tab",
  html.includes('<a href="#access-granting-mechanisms-to-audit">Appendix A</a>'));

check("escaped asterisk unescaped", !html.includes("\\*"));
check("asterisk still visible", /Zero Data Retention\*/.test(html));

check("external links open a new tab", /href="https:[^"]*" target="_blank"/.test(html));
check("no javascript: urls", !/javascript:/i.test(html));
check("no unescaped script tag", !/<script/i.test(html));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.extra ? "  -> " + c.extra : ""}`);
}
console.log(failed.length ? `\n${failed.length} FAILED` : "\nALL PASS");
process.exit(failed.length ? 1 : 0);
