"""Required status check: a PR touching data/ needs a curator's approval.

Replaces a blanket approval requirement that could not be scoped by path. A PR
that changes nothing under data/ passes at once, so a guide or code fix merges
without a second person. A PR that changes anything under data/ passes only once
someone CODEOWNERS lists has approved it. (#45)

Fails closed: any error exits non-zero, so a broken check blocks rather than
waves a change through.

Usage:
    python check_data_review.py --repo owner/repo --pr-number N
        [--codeowners .github/CODEOWNERS] [--data-prefix data/]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def parse_codeowners(path: Path) -> list[tuple[str, list[str]]]:
    """[(pattern, [@handle, ...])] in file order. Later entries win a tie."""
    rules = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            rules.append((parts[0], [p.lstrip("@") for p in parts[1:]]))
    return rules


def pattern_to_regex(pattern: str) -> re.Pattern[str]:
    """CODEOWNERS globs: ** spans directories, * stops at one."""
    p = pattern.lstrip("/")
    out = []
    i = 0
    while i < len(p):
        if p.startswith("**", i):
            out.append(".*")
            i += 2
        elif p[i] == "*":
            out.append("[^/]*")
            i += 1
        elif p[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(p[i]))
            i += 1
    body = "".join(out)
    # A trailing slash or a bare directory name covers everything inside it.
    if pattern.endswith("/"):
        body += ".*"
    return re.compile(rf"^{body}$")


def owners_for(path: str, rules: list[tuple[str, list[str]]]) -> list[str]:
    """Owners of a path. CODEOWNERS gives precedence to the last match."""
    found: list[str] = []
    for pattern, owners in rules:
        if pattern_to_regex(pattern).match(path):
            found = owners
    return found


def gh_json(args: list[str]) -> object:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args[:3])} failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def changed_files(repo: str, pr_number: int) -> list[str]:
    data = gh_json(
        ["gh", "api", f"repos/{repo}/pulls/{pr_number}/files", "--paginate",
         "--jq", "[.[].filename]"]
    )
    return list(data)


def approvers(repo: str, pr_number: int) -> list[str]:
    """Handles whose most recent decisive review is an approval."""
    data = gh_json(
        ["gh", "pr", "view", str(pr_number), "--repo", repo, "--json", "reviews"]
    )
    latest: dict[str, str] = {}
    for review in sorted(data["reviews"], key=lambda r: r.get("submittedAt") or ""):
        state = review.get("state", "")
        # COMMENTED leaves an earlier approval standing.
        if state in ("APPROVED", "CHANGES_REQUESTED", "DISMISSED"):
            latest[review["author"]["login"]] = state
    return sorted(h for h, state in latest.items() if state == "APPROVED")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument("--pr-number", type=int, required=True)
    parser.add_argument("--codeowners", type=Path, default=Path(".github/CODEOWNERS"))
    parser.add_argument("--data-prefix", default="data/")
    args = parser.parse_args()

    files = changed_files(args.repo, args.pr_number)
    touched = sorted(f for f in files if f.startswith(args.data_prefix))
    if not touched:
        print(f"No files under {args.data_prefix} in this PR. No curator review required.")
        print(f"Changed {len(files)} file(s).")
        return 0

    print(f"{len(touched)} file(s) under {args.data_prefix}:")
    for f in touched:
        print(f"  {f}")

    rules = parse_codeowners(args.codeowners)
    required = set()
    for f in touched:
        required.update(owners_for(f, rules))
    if not required:
        # A data path nobody owns. Fall back to everyone who owns any data path,
        # so a new folder is never left ungated.
        for pattern, owners in rules:
            if pattern.lstrip("/").startswith(args.data_prefix):
                required.update(owners)
    if not required:
        raise RuntimeError(
            f"No CODEOWNERS entry covers {args.data_prefix}. Refusing to pass."
        )

    approved_by = approvers(args.repo, args.pr_number)
    accepted = sorted(set(approved_by) & required)
    if accepted:
        print(f"Approved by {', '.join('@' + h for h in accepted)}.")
        return 0

    print(
        f"BLOCKED: this PR changes files under {args.data_prefix} and needs an approving "
        f"review from one of: {', '.join('@' + h for h in sorted(required))}.",
        file=sys.stderr,
    )
    if approved_by:
        print(
            f"Approved so far by {', '.join('@' + h for h in approved_by)}, "
            "none of whom own these paths.",
            file=sys.stderr,
        )
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:  # noqa: BLE001
        # Fail closed. An unreadable CODEOWNERS or a failed API call must block.
        print(f"check_data_review failed: {err}", file=sys.stderr)
        sys.exit(1)
