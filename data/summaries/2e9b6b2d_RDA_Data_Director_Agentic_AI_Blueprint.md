---
id: 2e9b6b2d
resource_name: RDA Data Director Agentic AI Blueprint
url: https://www.rd-alliance.org/groups/data-director-agentic-ai-blueprint/outputs/data-director-agentic-ai-tool-blueprint/
summarized_date: 2026-11-19
summarized_by: Claude Sonnet 5
reviewed_by: pbuendia
---

RDA-Microsoft community specification (v1.0, August 2026) for an agentic AI tool, the "Data Director", that helps researchers prepare and deposit FAIR-aligned research data. This summary covers only what is relevant to ALAF's scope: evaluating agentic system architecture and implementations used on scientific research data. It does not write policy, so the FAIR/CARE substantive content, RDA governance mechanics, and operational/business guidance are skipped. The architecture principles, non-functional requirements, and evaluation framework are the parts directly reusable as evaluation criteria.

## Architecture principles relevant to evaluating an agentic system

Of the Blueprint's 14 principles, these map directly onto system-architecture evaluation rather than FAIR/CARE policy:

- **Security by Design (P3)**: encryption, role-based access, and audit logging must be the default configuration, not opt-in.
- **Human in the Loop (P4)**: no consequential or irreversible action proceeds without explicit human approval. Distinguishes human-in-the-loop (approval required before acting) from human-on-the-loop (ongoing monitoring with override), and requires each workflow to document which applies.
- **Full Traceability (P5)**: every agent action and output must be traceable to its inputs, agent version, and human authorization, recorded as a directed graph using a standard such as PROV-O.
- **Data Sovereignty (P10)**: residency requirements extend beyond the dataset itself to AI processing, logs, temporary files, backups, and embeddings.
- **Deploy Anywhere (P11)**: must not require cloud infrastructure as a prerequisite; a minimum viable deployment must exist for resource-constrained environments.
- **Built to Last (P13)**: external dependencies (repositories, PID services) must not become single points of failure; workflows must queue or pause rather than fail silently when one is unavailable.

## Non-functional requirements usable as evaluation criteria

Section 7.2 defines measurable quality standards, several of which are directly applicable to assessing any agentic system touching research data, not just this one:

- **C1 Security / C4 Sovereignty**: encryption, role-based audit access, and jurisdiction-constrained storage and processing.
- **C2 Privacy**: the agent's role is to detect and flag potential identifiers and pause the workflow, not to anonymize or deidentify autonomously. Anonymization remains a human, context-specific decision.
- **C12 Data Governance / C13 AI Governance**: machine-readable governance policies; every agent action logged, attributable to a named agent identity, with irreversible actions (deletion, autocompletion) blocked by default without explicit human confirmation.
- **C14 Explainability**: every AI-generated output needs a human-readable explanation; override rights must be role-gated, not open to all users.
- **C15 Data and Metadata Quality**: AI-generated output must meet the same curation standard as manually produced records; low-quality or generic output must be flagged for mandatory human review before submission.

## Reference architecture

Section 9 lays out a layered architecture (presentation, application, AI, data, platform/integration) with named agent roles: Planning, Linking, Metadata, Repository, Provenance, and Validation agents, each with a defined scope. This is a concrete worked example of decomposing an agentic system into auditable components, useful as a comparison point when assessing other VT Radar entries' architecture diagrams.

## Evaluation framework and its caveats

Section 10 is the most directly reusable part for ALAF's own evaluation practice. Two points carry over directly:

1. **Schema compliance does not confirm semantic correctness.** A metadata record can validate against a schema while still being factually wrong. The Blueprint has no benchmark yet for catching this beyond cross-source consistency checks (flagging when a generated field contradicts its source record).
2. Each requirement is explicitly marked as either measurable now (testable through automated checks, audits, or load testing) or not yet measurable, with the gap attributed either to missing tooling/benchmarks or to needing direct human/stakeholder input. This measurable/not-yet-measurable split is a reusable pattern for writing evaluation criteria into other VT Radar entries describing agentic tools.

## What this resource does not do

The Blueprint leaves three things unresolved at v1.0: what "acceptable" AI-generated metadata quality looks like (no community-agreed benchmark exists), a CARE-principles evaluation methodology, and affordability/environmental-impact measurement. It is a specification for what an agentic system should do and how it should behave, not a certified or audited implementation.
