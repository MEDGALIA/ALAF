"""Every data Markdown file's front matter must parse as YAML.

GitHub renders front matter as a table and shows a parse error in place of the
file if it is invalid. "@" is a reserved YAML indicator, so an unquoted handle
such as `reviewed_by: @patbuen1` breaks the page. (#40)

Usage:
    python src/tests/test_front_matter_yaml.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
DIRS = ["data/summaries", "data/alaf"]
EXPECTED_HANDLE_KEYS = ("summarized_by", "reviewed_by", "updated_by")


def main() -> int:
    failures = []
    checked = 0

    for rel in DIRS:
        folder = REPO / rel
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.md")):
            checked += 1
            text = path.read_text(encoding="utf-8")
            match = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
            if not match:
                print(f"FAIL  {rel}/{path.name}  -> no front matter block")
                failures.append(path.name)
                continue
            try:
                meta = yaml.safe_load(match.group(1)) or {}
            except yaml.YAMLError as err:
                print(f"FAIL  {rel}/{path.name}  -> {str(err).splitlines()[0]}")
                failures.append(path.name)
                continue

            handles = [
                f"{k}={meta[k]!r}"
                for k in EXPECTED_HANDLE_KEYS
                if isinstance(meta.get(k), str) and meta[k].startswith("@")
            ]
            print(f"PASS  {rel}/{path.name}{'  ' + ', '.join(handles) if handles else ''}")

    if not checked:
        print("FAIL  no Markdown files found to check")
        return 1

    print(f"\n{len(failures)} FAILED" if failures else f"\nALL PASS ({checked} file(s))")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
