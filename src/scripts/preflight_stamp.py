"""Check that verification stamping can succeed, before testing it live.

Asserts from repository state alone the conditions that have broken stamping
before: a `[skip ci]` token suppressing later workflows (PR #16), actions/checkout
persisting a token that overrides the App credentials (PR #20), and branch
protection carrying no bypass for required status checks (PR #23).

Run it after any change to branch protection, workflows, secrets, or the App.

Read-only: performs no writes and needs only a `gh` login with repo read.

Usage:
    python preflight_stamp.py [--repo owner/repo]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

APP_SLUG = "vt-radar-verification-bot"
REQUIRED_SECRETS = ("VT_RADAR_APP_ID", "VT_RADAR_APP_PRIVATE_KEY")
SKIP_CI_TOKENS = ("[skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]")
WORKFLOWS = Path(".github/workflows")


class Check:
    """One preflight assertion and its outcome."""

    def __init__(self, name: str):
        self.name = name
        self.ok: bool | None = None
        self.detail = ""

    def passed(self, detail: str = "") -> "Check":
        self.ok, self.detail = True, detail
        return self

    def failed(self, detail: str) -> "Check":
        self.ok, self.detail = False, detail
        return self


def gh_json(path: str, repo: str):
    """GET a gh api path, returning parsed JSON or None on any error."""
    result = subprocess.run(
        ["gh", "api", path.format(repo=repo)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def check_secrets(repo: str) -> Check:
    c = Check("App credentials are stored as repo secrets")
    data = gh_json("repos/{repo}/actions/secrets", repo)
    if data is None:
        return c.failed("could not list secrets (needs admin read on the repo)")
    names = {s["name"] for s in data.get("secrets", [])}
    missing = [s for s in REQUIRED_SECRETS if s not in names]
    if missing:
        return c.failed(f"missing: {', '.join(missing)}")
    return c.passed(", ".join(REQUIRED_SECRETS))


def check_ruleset_bypass(repo: str) -> Check:
    """The App must be able to bypass every rule, not just the PR rule.

    Classic protection's `bypass_pull_request_allowances` waives only the
    pull-request requirement, never required status checks. A ruleset's
    bypass_actors covers all rules at once. (PR #23)
    """
    c = Check("App can bypass all rules on main (ruleset bypass_actors)")
    rules = gh_json("repos/{repo}/rules/branches/main", repo)
    if not rules:
        return c.failed("no ruleset rules apply to main -- main may be unprotected")

    ruleset_ids = {r["ruleset_id"] for r in rules if "ruleset_id" in r}
    types = {r["type"] for r in rules}
    for missing in ("pull_request", "required_status_checks"):
        if missing not in types:
            return c.failed(f"ruleset does not enforce '{missing}' -- protection is weaker than intended")

    for rid in ruleset_ids:
        detail = gh_json(f"repos/{{repo}}/rulesets/{rid}", repo)
        if not detail:
            continue
        for actor in detail.get("bypass_actors", []):
            if actor.get("actor_type") == "Integration":
                return c.passed(
                    f"ruleset {rid}, app id {actor.get('actor_id')}, "
                    f"mode={actor.get('bypass_mode')}"
                )
    return c.failed(
        "no GitHub App listed in bypass_actors: the stamp push to main will "
        "be rejected (PR #23)"
    )


def check_admin_can_bypass(repo: str) -> Check:
    """A repo admin must be able to merge a PR they authored themselves.

    GitHub forbids self-approval, so on a PR the curator opened against a path
    they own, nobody's approval satisfies the rule. A ruleset needs
    RepositoryRole 5 (admin) in bypass_actors, the equivalent of classic
    protection's `enforce_admins: false`.
    """
    c = Check("Repo admins can bypass (can merge their own PRs)")
    rules = gh_json("repos/{repo}/rules/branches/main", repo)
    if not rules:
        return c.failed("no ruleset applies to main")
    for rid in {r["ruleset_id"] for r in rules if "ruleset_id" in r}:
        detail = gh_json(f"repos/{{repo}}/rulesets/{rid}", repo)
        if not detail:
            continue
        for actor in detail.get("bypass_actors", []):
            if actor.get("actor_type") in ("RepositoryRole", "OrganizationAdmin"):
                return c.passed(
                    f"{actor['actor_type']} id {actor['actor_id']}, "
                    f"mode={actor.get('bypass_mode')}"
                )
    return c.failed(
        "no admin role in bypass_actors -- the curator cannot merge their own "
        "PRs (self-approval is forbidden, so nothing can satisfy the review rule)"
    )


def check_classic_protection_gone(repo: str) -> Check:
    """Classic protection and a ruleset stack; the strictest wins.

    Leaving the old rule in place would keep rejecting the App's push even
    though the ruleset allows it.
    """
    c = Check("Classic branch protection removed (does not stack with ruleset)")
    result = subprocess.run(
        ["gh", "api", f"repos/{repo}/branches/main/protection"],
        capture_output=True, text=True,
    )
    if result.returncode != 0 and "Branch not protected" in (result.stdout + result.stderr):
        return c.passed("none (ruleset is the only source of protection)")
    if result.returncode == 0:
        return c.failed(
            "classic protection still present alongside the ruleset -- it will "
            "keep rejecting the App's push; delete it"
        )
    return c.failed("could not determine classic protection state")


def check_app_exists(repo: str) -> Check:
    """Confirm the App exists and is owned by the same org as the repo.

    `repos/{repo}/installation` needs the App's own JWT and returns 401 for a
    user token, so this reads the public app endpoint instead. The bypass check
    below proves the installation is wired up.
    """
    c = Check(f"App '{APP_SLUG}' exists and is owned by the repo's org")
    data = gh_json(f"apps/{APP_SLUG}", repo)
    if data is None:
        return c.failed(f"no GitHub App with slug '{APP_SLUG}'")
    owner = data.get("owner", {}).get("login", "")
    expected_owner = repo.split("/")[0]
    if owner.lower() != expected_owner.lower():
        return c.failed(f"owned by '{owner}', expected '{expected_owner}'")
    return c.passed(f"app id {data.get('id')}, owner {owner}")


def check_no_skip_ci() -> Check:
    """A bot commit carrying [skip ci] becomes the PR's head commit.

    GitHub honours skip directives on a PR's head commit, suppressing every
    later workflow on that PR including the post-merge stamp. No run is
    created, so the failure is silent. (PR #16)
    """
    c = Check("No workflow writes a [skip ci] commit message")
    offenders = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        for num, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "git commit" not in line:
                continue
            if any(tok in line.lower() for tok in SKIP_CI_TOKENS):
                offenders.append(f"{path.name}:{num}")
    if offenders:
        return c.failed(
            f"{', '.join(offenders)}: silently suppresses all later workflows "
            f"on the PR (PR #16)"
        )
    return c.passed(f"checked {len(list(WORKFLOWS.glob('*.yml')))} workflow file(s)")


def check_token_before_checkout() -> Check:
    """actions/checkout persists its token as a git http.extraheader.

    That header wins over credentials placed in the remote URL afterwards, so
    the App token must be minted before the checkout and passed to it via
    `token:`, or the push goes out as github-actions[bot] and is rejected. (PR #20)
    """
    c = Check("Stamp workflow checks out using the App token")
    path = WORKFLOWS / "stamp-verification.yml"
    if not path.exists():
        return c.failed(f"{path} not found")
    raw = path.read_text(encoding="utf-8")
    # Strip comments before searching. The workflow *documents* this very
    # ordering rule in a comment above the mint step, and matching that
    # comment would report the steps in the wrong order.
    text = "\n".join(re.sub(r"#.*$", "", line) for line in raw.splitlines())

    if re.search(r"git\s+remote\s+set-url", text):
        return c.failed(
            "uses `git remote set-url` to inject the token: ineffective, the "
            "checkout's auth header takes priority (PR #20)"
        )

    # Match the step declarations themselves, not incidental mentions.
    mint = text.find("uses: actions/create-github-app-token")
    checkout = text.find("uses: actions/checkout")
    if mint == -1:
        return c.failed("does not mint an App token")
    if checkout == -1:
        return c.failed("has no checkout step")
    if mint > checkout:
        return c.failed("mints the App token *after* checkout; it must come before")
    if "token: ${{ steps.app-token.outputs.token }}" not in text:
        return c.failed("checkout does not receive the App token via `token:`")
    return c.passed("App token minted before checkout and passed to it")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default="MEDGALIA/ALAF", help="owner/repo")
    args = parser.parse_args()

    checks = [
        check_app_exists(args.repo),
        check_secrets(args.repo),
        check_ruleset_bypass(args.repo),
        check_admin_can_bypass(args.repo),
        check_classic_protection_gone(args.repo),
        check_no_skip_ci(),
        check_token_before_checkout(),
    ]

    print(f"Preflight: verification stamping on {args.repo}\n")
    for c in checks:
        mark = "PASS" if c.ok else "FAIL"
        print(f"  [{mark}] {c.name}")
        if c.detail:
            print(f"         {c.detail}")

    failed = [c for c in checks if not c.ok]
    print()
    if failed:
        print(f"{len(failed)} check(s) failed -- stamping would not succeed. "
              f"Fix these before running a live test.")
        return 1
    print("All checks passed. Verification stamping is next.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
