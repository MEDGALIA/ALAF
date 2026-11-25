"""Check stamp_verification.stamp_markdown against the real checklist.

Covers the four cases that matter: a changed file with a blank reviewer gets
stamped, an unchanged file does not, an existing reviewer is never overwritten,
and the body is left byte for byte alone. (#40)

Usage:
    python src/tests/test_stamp_markdown.py
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "src" / "scripts"))

from stamp_verification import stamp_markdown  # noqa: E402

SRC = REPO / "data" / "alaf" / "ALAF_CHECKLIST.md"
REVIEWER = "@curatorB"


def fresh(tmp: Path) -> tuple[Path, Path]:
    head, base = tmp / "head", tmp / "base"
    shutil.rmtree(head, ignore_errors=True)
    shutil.rmtree(base, ignore_errors=True)
    head.mkdir(parents=True)
    base.mkdir(parents=True)
    return head, base


def main() -> int:
    if not SRC.exists():
        print(f"FAIL  {SRC} not found")
        return 1

    tmp = Path(tempfile.mkdtemp())
    failures = []

    def check(name: str, ok: bool, extra: str = "") -> None:
        print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -> ' + extra if extra else ''}")
        if not ok:
            failures.append(name)

    # Changed by the PR, reviewer blank -> stamped.
    head, base = fresh(tmp)
    shutil.copy(SRC, head / SRC.name)
    (base / SRC.name).write_text("different content\n", encoding="utf-8")
    got = stamp_markdown(head, base, REVIEWER)
    text = (head / SRC.name).read_text(encoding="utf-8")
    check("changed and blank is stamped", got == [SRC.name], str(got))
    check("reviewer written", f"reviewed_by: {REVIEWER}" in text)
    check("key not duplicated", text.count("reviewed_by:") == 1)

    # Identical to base -> untouched.
    head, base = fresh(tmp)
    shutil.copy(SRC, head / SRC.name)
    shutil.copy(SRC, base / SRC.name)
    check("unchanged file is skipped", stamp_markdown(head, base, REVIEWER) == [])

    # Reviewer already present -> preserved.
    head, base = fresh(tmp)
    (head / SRC.name).write_text(
        SRC.read_text(encoding="utf-8").replace("reviewed_by:", "reviewed_by: @someoneElse"),
        encoding="utf-8",
    )
    (base / SRC.name).write_text("different content\n", encoding="utf-8")
    check("existing reviewer preserved", stamp_markdown(head, base, REVIEWER) == [])
    check("existing handle intact", "@someoneElse" in (head / SRC.name).read_text(encoding="utf-8"))

    # Body untouched by stamping.
    head, base = fresh(tmp)
    shutil.copy(SRC, head / SRC.name)
    (base / SRC.name).write_text("different content\n", encoding="utf-8")
    stamp_markdown(head, base, REVIEWER)
    after = (head / SRC.name).read_text(encoding="utf-8").split("---", 2)[2]
    before = SRC.read_text(encoding="utf-8").split("---", 2)[2]
    check("body preserved", after == before)

    shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{len(failures)} FAILED" if failures else "\nALL PASS")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
