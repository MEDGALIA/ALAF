// Every file in data/summaries must still render cleanly through markdown.js.
// Guards against a change made for the checklist breaking summaries. (#40)
import { readFileSync, readdirSync } from "node:fs";

const repo = new URL("../../", import.meta.url);
const { parseFrontMatter, renderMarkdown } = await import(
  new URL("docs/markdown.js", repo).href
);

const dir = new URL("data/summaries/", repo);
let failed = 0;

for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  const { meta, body } = parseFrontMatter(readFileSync(new URL(name, dir), "utf8"));
  const html = renderMarkdown(body);
  const problems = [];
  if (!meta.id) problems.push("front matter id missing");
  if (!meta.resource_name) problems.push("resource_name missing");
  if (html.includes("<p>---</p>")) problems.push("stray rule");
  if (/<p>\|/.test(html)) problems.push("stray pipe row");
  if (!html.includes("<h")) problems.push("no headings");
  if (html.includes("undefined")) problems.push("undefined leaked");
  if (/<script/i.test(html)) problems.push("script tag");
  if (html.includes("[ ]")) problems.push("literal task box");
  console.log(
    `${problems.length ? "FAIL" : "PASS"}  ${name}${problems.length ? "  -> " + problems.join(", ") : ""}`
  );
  failed += problems.length ? 1 : 0;
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
