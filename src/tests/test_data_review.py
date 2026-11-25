"""Check the data/ review gate decides correctly. (#45)

Covers the three outcomes the gate exists for, plus the CODEOWNERS matching and
the fail-closed path. GitHub calls are stubbed, so this needs no network.

Usage:
    python src/tests/test_data_review.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "src" / "scripts"))

import check_data_review as cdr  # noqa: E402

CODEOWNERS = """\
# List authorized GitHub reviewers to the right of each file/resource.
data/json/** @pbuendia @gnanabharathy @seykim10 @patbuen1
data/VANTAGE-Technology-Radar.xlsx @pbuendia @gnanabharathy @seykim10 @patbuen1
data/summaries/** @pbuendia @gnanabharathy @seykim10 @patbuen1
data/alaf/** @pbuendia @gnanabharathy @seykim10 @patbuen1

.github/workflows/** @pbuendia
.github/CODEOWNERS @pbuendia
"""

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -> ' + extra if extra else ''}")
    if not ok:
        failures.append(name)


def run(tmp: Path, files: list[str], reviews: list[tuple[str, str]]) -> int:
    """Run main() with the GitHub calls stubbed, returning its exit code."""
    cdr.changed_files = lambda repo, pr: files
    cdr.approvers = lambda repo, pr: sorted(h for h, s in reviews if s == "APPROVED")
    argv = sys.argv
    sys.argv = [
        "check_data_review.py", "--repo", "o/r", "--pr-number", "1",
        "--codeowners", str(tmp / "CODEOWNERS"),
    ]
    try:
        return cdr.main()
    finally:
        sys.argv = argv


def main() -> int:
    tmp = Path(tempfile.mkdtemp())
    (tmp / "CODEOWNERS").write_text(CODEOWNERS, encoding="utf-8")

    # CODEOWNERS matching, before the decision logic that depends on it.
    rules = cdr.parse_codeowners(tmp / "CODEOWNERS")
    check("parses every rule", len(rules) == 6, str(len(rules)))
    check("matches a ** path", cdr.owners_for("data/alaf/ALAF_CHECKLIST.md", rules) != [])
    check("matches an exact file",
          cdr.owners_for("data/VANTAGE-Technology-Radar.xlsx", rules) != [])
    check("no owner for a guide", cdr.owners_for("user_guides/VT_RADAR.md", rules) == [])
    check("* does not cross a slash",
          cdr.owners_for("data/alaf/deep/nested.md", rules) != [])
    check("workflows owned by one handle",
          cdr.owners_for(".github/workflows/ci.yml", rules) == ["pbuendia"])

    # 1. No data files -> pass with no approval.
    check("guide-only PR passes unapproved",
          run(tmp, ["README.md", "user_guides/VT_RADAR.md"], []) == 0)

    # 2. Data files, no approval -> block.
    check("data PR blocks unapproved",
          run(tmp, ["data/alaf/ALAF_CHECKLIST.md"], []) == 1)

    # 3. Data files, curator approved -> pass.
    check("data PR passes once a curator approves",
          run(tmp, ["data/alaf/ALAF_CHECKLIST.md"], [("patbuen1", "APPROVED")]) == 0)

    # An approval from someone who owns nothing must not satisfy it.
    check("outsider approval does not count",
          run(tmp, ["data/json/knowledgebase.json"], [("ugodepaker", "APPROVED")]) == 1)

    # A dismissed approval must not count.
    check("dismissed approval does not count",
          run(tmp, ["data/summaries/x.md"], [("patbuen1", "DISMISSED")]) == 1)

    # A mixed PR is gated by its data half.
    check("mixed PR is gated by the data file",
          run(tmp, ["README.md", "data/json/knowledgebase.json"], []) == 1)

    # An unowned path under data/ falls back to the data owners, never ungated.
    check("unowned data path still requires approval",
          run(tmp, ["data/reports/workbook_analysis.md"], []) == 1)
    check("unowned data path accepts a data owner",
          run(tmp, ["data/reports/workbook_analysis.md"],
              [("seykim10", "APPROVED")]) == 0)

    # Fail closed: CODEOWNERS covering no data path must not pass a data PR.
    (tmp / "CODEOWNERS").write_text(".github/CODEOWNERS @pbuendia\n", encoding="utf-8")
    try:
        code = run(tmp, ["data/alaf/ALAF_CHECKLIST.md"], [("patbuen1", "APPROVED")])
        check("no data owners raises", False, f"returned {code} instead of raising")
    except RuntimeError:
        check("no data owners raises", True)

    print(f"\n{len(failures)} FAILED" if failures else "\nALL PASS")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
