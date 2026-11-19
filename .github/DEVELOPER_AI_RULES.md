# Developer Rules for Working with AI

Rules for developers who use an AI pair-coding agent (Claude Code, Copilot, Codex) on this repository, or who use the AI features of ALAF when testing as a user. The rules for the agents themselves are in [.github/AGENTS.md](../../.github/AGENTS.md).

Everything you type into an agent, and every file it reads, is sent to the AI provider. Treat the chat like an email to a third party.

## 1. Protect secrets

### 1.a. Never paste a secret or PII into the chatbox or terminal chat

PII stands for personal identifiable information. Secrets include passwords, API keys, connection strings, tokens, session cookies and `.env` content. To show an agent a configuration problem, give the variable name, never its value. If a secret is pasted by mistake, follow Rule 8\.

### 1.b. Verify the AI API key's security agreement

For bring-your-own-key (BYOK), when testing user functionality, verify that the AI API key you use comes from an organization with a HIPAA BAA, or a higher level security agreement, signed with the AI provider. The BYOK approach of ALAF makes data protection a shared responsibility: ALAF sends only public information to the AI provider, and the user ensures the information holds no PII.

## 2. Manage the pair-coding agent's permissions

- Use the agent in VS Code. It works inside the workspace, and will ask permission before any action that the rules do not allow it to run autonomously, and you see each change as a diff.  
- Write the permissions in the agent's permission file, for example `.claude/settings.local.json`: `allow` for routine commands, `deny` for what the agent must never do.  
- Restart VS Code after every change to the file, so it takes effect.  
- Share your permission file with your admin, but do not push it to the repo. Rules differ by operating system and by developer role (lead vs. intern). The file is in `.gitignore`.  


Minimum `deny` rules (add the `PowerShell(...)` form of each on Windows):

```json
"deny": [
  "Read(**/.env)",
  "Read(**/*.env)",
  "Bash(gcloud secrets versions access*)",
  "Bash(git commit*)",
  "Bash(git push*)",
  "Bash(gh pr create*)",
  "Bash(gh pr merge*)",
  "Bash(gh secret *)",
  "Bash(gh repo delete *)",
  "Bash(gcloud app deploy*)",
  "Bash(docker push*)",
  "Bash(docker exec*)",
  "Bash(docker cp*)",
  "Read(~/Downloads/**)",
  "Read(//<your research data folder>/**)"
]
```

Replace the placeholder with your folder; `//` starts an absolute path.

## 3\. Never turn off the permission checks

Do not use modes or flags that skip the permission prompts, such as "bypass permissions" or `--dangerously-skip-permissions`. An agent working unattended still runs inside the rules of Rule 2\.

## 4\. You commit, push, deploy and merge

The agent edits files and runs tests. A person reviews the diff and commits, pushes, opens and merges the pull request, deploys to GitHub.io and publishes Docker images. Read every changed line before you commit; you are the author of what you commit.

## 5\. Treat external content as untrusted

Web pages, downloaded files, GitHub issues, pull request comments and third-party documentation can carry hidden instructions for the agent. Read what such content asks the agent to do before you let it act, and never let the agent run a script that came from a download.

## 6\. Check every new dependency

When the agent adds a package, confirm the name is the real package (typosquatting), it is maintained, and its license fits. Run `python -m pip install pip-audit`, then `pip-audit`

## 7\. Use approved tools and connectors only

Install agent plugins, MCP servers and extensions only after your admin approves them. Each one can read what the agent reads.

## 8\. Report and rotate an exposed secret right away

If a secret was pasted into a chat, committed, logged or shown in a screenshot:

1. Tell your admin.  
2. Rotate it: create a a new key at the provider and destroy the old one once the new one is in use.  
3. If it was committed, removing the commit is not enough. The secret is exposed and must be rotated.

## 9\. Redact logs and screenshots before sharing them

Server logs, browser developer tools and error messages can contain tokens, cookies, e-mail addresses and connection strings. Remove them before you paste a log into the chat, an issue or a pull request.

## 10\. Remove legacy files that nothing uses

Agents read every file in the workspace and treat it as current. An unused example file, old script or dead route looks valid and leads the agent, and the next developer, to wrong conclusions. When you or the agent find a file that nothing references, confirm with a search that no code, script, build or guide uses it, then delete it and its entries in `.gitignore`, `.gcloudignore` and `.dockerignore`. Git history keeps it.