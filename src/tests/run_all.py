"""Run every test that needs no browser and no network.

Usage:
    python src/tests/run_all.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TESTS = Path(__file__).resolve().parent

SUITES = [
    ([sys.executable, str(TESTS / "test_front_matter_yaml.py")], "front matter yaml"),
    ([sys.executable, str(TESTS / "test_stamp_markdown.py")], "stamp_markdown"),
    (["node", str(TESTS / "test_markdown_render.mjs")], "markdown render"),
    (["node", str(TESTS / "test_summary_render.mjs")], "summary render"),
]


def main() -> int:
    failed = []
    for cmd, name in SUITES:
        # Flush first, or the child's output lands before this header.
        print(f"\n=== {name} ===", flush=True)
        try:
            result = subprocess.run(cmd, cwd=REPO)
        except FileNotFoundError:
            print(f"SKIP  {name}: {cmd[0]} not on PATH", flush=True)
            continue
        if result.returncode:
            failed.append(name)

    print("\n" + "=" * 40)
    print(f"FAILED: {', '.join(failed)}" if failed else "All suites passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
