---
id: d6d28dfa
resource_name: Kaggle Prototype to Production Whitepaper
url: https://www.kaggle.com/whitepaper-prototype-to-production
summarized_date: 2026-11-24
summarized_by: @pbuendia
reviewed_by:
---

Technical guide (Google, updated May 2026) on moving AI agents from prototype to production. This summary covers only the security-relevant material, filtered for scientific research data processing involving PII and IP. Skipped: People/Process org chart, CI/CD mechanics, rollout strategies, A2A/MCP interoperability, and tool/agent registries.

## Agent-specific risks (vs. traditional software)

Because agents reason, choose tools, and hold memory across sessions, they introduce risks static software doesn't have:

- **Prompt injection / rogue actions**: a malicious or malformed input tricks the agent into bypassing restrictions. For a research pipeline, this is the mechanism by which an agent could be coaxed into exporting restricted data or crossing an IP boundary it shouldn't.
- **Data leakage**: the agent exposes sensitive information through its own responses or through tool use (e.g., echoing PII pulled from a dataset into an answer, or passing it to an external tool/API).
- **Memory poisoning**: false information written into an agent's persistent memory corrupts every later interaction. In a research context, this could mean mislabeled sensitivity/provenance metadata persisting and silently propagating.

## Three-layer defense model

1. **System Instructions ("the agent's constitution")**: policy for desired/undesired behavior engineered directly into the prompt. For PII/IP handling, this is where data-handling rules (what may never be disclosed, which fields are restricted) are stated explicitly, not assumed.
2. **Guardrails / enforcement layer**:
   - *Input filtering*: classifiers screen prompts before they reach the agent.
   - *Output filtering*: a safety-filter pass on the agent's response before it reaches the user, specifically callable out to block **PII**, toxic content, or policy violations. A second, centralized check (gateway-level) screens for prompt injection, tool poisoning, and sensitive data leakage.
   - *Human-in-the-loop escalation*: high-risk or ambiguous actions pause for human review rather than executing automatically. Relevant for any action touching restricted research data or IP-bearing material.
3. **Continuous assurance**: re-run the full evaluation/safety pipeline on any change to the model or its safety systems; maintain dedicated red-teaming and adversarial test datasets rather than one-time sign-off.

## Secrets and access control

API keys and other credentials must be injected at runtime via a secrets manager, never hardcoded in the repo. Cloud-platform access is granted least-privilege, scoped to only the resources a given engineer or service account needs, the general pattern that also bounds exposure of PII/IP datasets to only the services that must touch them.

## Production security loop (Observe → Act → Evolve)

Security is treated as continuous, not a one-time gate:

- **Observe**: monitoring/logging detects a new threat (e.g., a novel prompt-injection technique, or an unexpected interaction resulting in a minor data leak).
- **Act**: immediate containment, a "circuit breaker" disables the affected tool; suspicious requests route to human review to assess scope/impact.
- **Evolve**: the incident is converted into a permanent regression test (added to the evaluation dataset), guardrails/system prompt are refined to block the specific attack vector, and the fix is deployed through the same automated pipeline used for every other change, closing the vulnerability for good rather than patching it ad hoc.

The paper never names a specific regulation (HIPAA, GDPR), but it focuses on operational mechanisms like output filtering, access control, and leak-prevention guardrails required by such frameworks.
