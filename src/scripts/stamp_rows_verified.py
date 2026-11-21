"""Write Verified By/Last Verified for an explicit list of row IDs.

Used by the one-click verification feature (#36): a curator selects rows in
the UI and this stamps them directly, overwriting any existing value --
unlike stamp_verification.py, which only fills blank fields from a PR's
approving review.

Usage:
    python stamp_rows_verified.py --sheet knowledgebase --ids id1,id2 --verified-by @handle
"""

from __future__ import annotations

import argparse
import datetime
from pathlib import Path

from radar_sync_common import load_sheet_json, save_sheet_json
from stamp_verification import apply_xlsx_stamps

DEFAULT_JSON_DIR = Path("data/json")
DEFAULT_XLSX = Path("data/VANTAGE-Technology-Radar.xlsx")


def apply_stamps(json_dir: Path, sheet: str, row_ids: set[str], verified_by: str, verified_date: str) -> set[str]:
    path = json_dir / f"{sheet}.json"
    data = load_sheet_json(path)
    if not data:
        raise SystemExit(f"{path} not found or empty")
    stamped = set()
    for r in data.get("records", []):
        if r.get("id") in row_ids:
            r["verified_by"] = verified_by
            r["last_verified"] = verified_date
            stamped.add(r["id"])
    save_sheet_json(path, data)
    return stamped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-dir", type=Path, default=DEFAULT_JSON_DIR)
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--sheet", required=True, help="JSON filename stem, e.g. knowledgebase")
    parser.add_argument("--ids", required=True, help="comma-separated row IDs")
    parser.add_argument("--verified-by", required=True, help="e.g. @handle")
    args = parser.parse_args()

    row_ids = {i.strip() for i in args.ids.split(",") if i.strip()}
    if not row_ids:
        raise SystemExit("No row IDs given.")

    today = datetime.date.today().isoformat()
    stamped = apply_stamps(args.json_dir, args.sheet, row_ids, args.verified_by, today)

    missing = row_ids - stamped
    if missing:
        print(f"WARNING: IDs not found in {args.sheet}.json: {sorted(missing)}")
    if not stamped:
        raise SystemExit("No matching rows -- nothing stamped.")

    apply_xlsx_stamps(args.xlsx, stamped, args.verified_by, today)
    print(f"Stamped {len(stamped)} row(s) in {args.sheet}, verified by {args.verified_by} on {today}: {sorted(stamped)}")


if __name__ == "__main__":
    main()
