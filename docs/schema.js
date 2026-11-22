// Per-sheet field definitions, built from dictionary.json. Field names and
// vocabulary terms are never hardcoded here, a Dictionary/Vocabulary edit must
// reach the form with no JS change. (#36)
import { AUTO_MANAGED_FIELDS, DATA_DIR, DICTIONARY_FILE, DEFAULT_BRANCH } from "./config.js";
import { fetchRawJson } from "./github-api.js";

export async function loadDictionary() {
  return fetchRawJson(`${DATA_DIR}/${DICTIONARY_FILE}`, DEFAULT_BRANCH);
}

function byPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0);
}

export function fieldsForSheet(dictionary, sheetName) {
  return dictionary.columns.filter((c) => c.applies_to.includes(sheetName)).sort(byPosition);
}

export function editableFields(dictionary, sheetName) {
  return fieldsForSheet(dictionary, sheetName).filter(
    (c) => !AUTO_MANAGED_FIELDS.includes(c.key)
  );
}

export function autoManagedFields(dictionary, sheetName) {
  return fieldsForSheet(dictionary, sheetName).filter((c) =>
    AUTO_MANAGED_FIELDS.includes(c.key)
  );
}

// Group editable fields for the drawer so the form reads in sections rather
// than one long column.
const SECTIONS = [
  { title: "Identity", keys: ["resource_name", "url", "source_organization", "version"] },
  { title: "Classification", keys: ["resource_type", "maturity_level", "agentic_features_covered", "topic_focus", "alaf_checklist_mapping"] },
  { title: "Dates", keys: ["publication_version_date", "discovery_date", "deprecation_date"] },
];

export function groupedEditableFields(dictionary, sheetName) {
  const fields = editableFields(dictionary, sheetName);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const groups = [];
  const used = new Set();

  for (const section of SECTIONS) {
    const items = section.keys.map((k) => byKey.get(k)).filter(Boolean);
    items.forEach((f) => used.add(f.key));
    if (items.length) groups.push({ title: section.title, fields: items });
  }

  // Anything the Dictionary adds later lands here instead of disappearing.
  const rest = fields.filter((f) => !used.has(f.key));
  if (rest.length) groups.push({ title: "Notes", fields: rest });
  return groups;
}

export function isMultiLine(field) {
  return field.value_type === "free_text" && /notes|relevance|description/.test(field.key);
}
