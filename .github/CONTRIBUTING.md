# Contributing to ALAF

ALAF, the Agentic Landscape Assessment Framework, is the technical home of the RDA Working Group [VANTAGE](https://www.rd-alliance.org/groups/visiting-agent-network-trusted-access-governance-evaluation-vantage-wg/activity/), which is formed, endorsed and active. The VT Radar knowledge base it maintains is reviewed, and every change carries a named reviewer.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Open source, moderated contribution

**The licenses are open.** Code is [BSD 3-Clause](../LICENSE) and the VT Radar data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Anyone may fork, modify, redistribute and build on either, including commercially, with attribution. Running your own VT Radar from a fork is a supported use.

**Contribution to this repository is moderated.** Write access is granted to VANTAGE Working Group collaborators. Everyone else contributes through issues, or by forking. An open license does not carry an open commit bit.

## Who can do what

| You are | You can | How |
|---|---|---|
| Anyone | Report an error, suggest a resource, report a bug, discuss direction | [Open an issue](https://github.com/MEDGALIA/ALAF/issues/new/choose) |
| Anyone | Reuse or build on ALAF independently | Fork, under BSD 3-Clause and CC BY 4.0 |
| Anyone | Propose a code or documentation change | Pull request from a fork, see [Code and documentation changes](#code-and-documentation-changes) |
| Collaborator with write access | Edit the VT Radar in the curator UI and open a pull request | [Curator UI](https://medgalia.github.io/ALAF/), see [`user_guides/VT_RADAR.md`](../user_guides/VT_RADAR.md) |
| Code owner | Approve and merge changes to the VT Radar | Pull request review, see [CODEOWNERS](CODEOWNERS) |
| Admin | Branch protection, collaborator access, workflow secrets | Repository settings |

Write access and review authority are separate. Write access lets you edit and propose. Only an approval from an account listed in [CODEOWNERS](CODEOWNERS) satisfies the review requirement on `data/json/**` and the workbook.

**Becoming a collaborator:** join the [VANTAGE Working Group](https://www.rd-alliance.org/groups/visiting-agent-network-trusted-access-governance-evaluation-vantage-wg/activity/), then ask a maintainer. There is no separate onboarding step.

## Report or suggest something

Issues are open to everyone and are the main route into the project. Pick the matching template when you [open one](https://github.com/MEDGALIA/ALAF/issues/new/choose):

| Template | Use it for |
|---|---|
| Suggest a resource | A new VT Radar entry |
| Report a data error | A wrong or outdated field on an existing row |
| Report a bug | Scripts, workflows, or the curator UI |
| Discuss framework direction | ALAF scope, checklist, or methodology |

Report a suspected vulnerability privately through [SECURITY.md](SECURITY.md), not as an issue.

## Proposing a VT Radar data change

Only collaborators can change the VT Radar directly, because every data change must stay inside the reviewed pipeline that stamps `Verified By`.

**From outside the Working Group:** open a *Suggest a resource* or *Report a data error* issue. The template asks for exactly the fields a curator needs, and a curator applies the change. Contributions from outside the Working Group are not credited in the row itself; join the Working Group and take a maintainer role to be named as an editor or reviewer.

**As a collaborator:** use the [curator UI](https://medgalia.github.io/ALAF/), which stages your edits and opens a pull request for you. [`user_guides/VT_RADAR.md`](../user_guides/VT_RADAR.md) covers the full flow, including the xlsx upload route if you prefer working in Excel.

Do not hand-edit files under `data/json/`, they are generated. Edit through the UI or the workbook.

## Code and documentation changes

Fork the repository, branch, and open a pull request. This works normally for anything under `src/`, `docs/`, `developer_guides/`, `user_guides/` and the workflows.

Two things to expect:

- **Your checks may pause.** GitHub holds Actions runs from first-time contributors until a maintainer releases them.
- **Data files are the exception.** A pull request from a fork gets no automatic xlsx and JSON sync, because `GITHUB_TOKEN` cannot write to a fork's branch. Send VT Radar data changes as an issue instead, as above.

There is no CLA or DCO. Contributions are taken under the same license as the files you change.

## Ground rules

- Every change goes through a pull request, no direct pushes to `main`.
- Keep pull requests scoped to one concern.
- Do not commit secrets, credentials, or personal data.
- Update the guide in `developer_guides/` when you change a script's behavior.

## Development setup

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r src\scripts\requirements.txt
```

[`developer_guides/scripts-guide.md`](../developer_guides/scripts-guide.md) covers what each script does and how to run it. [`developer_guides/backend-implementation-plan.md`](../developer_guides/backend-implementation-plan.md) and [`developer_guides/frontend-implementation-plan.md`](../developer_guides/frontend-implementation-plan.md) cover the design.

## Pull request checklist

- [ ] Scoped to one concern
- [ ] Docs in `developer_guides/` updated if a script's behavior changed
- [ ] No unrelated formatting or whitespace churn
- [ ] No secrets, credentials, or personal data
