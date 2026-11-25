"""Push data/VANTAGE-Technology-Radar.xlsx to a Google Sheet, for viewing.

GitHub's file preview does not render .xlsx conditional formatting, so the
colour-coding on Maturity Level, Resource Type and Topic Focus is invisible
there. Google Sheets renders it in a browser. See the Google Drive mirror
section in developer_guides/backend-implementation-plan.md.

main on GitHub stays the only source of truth. This script only pushes, nothing
reads the Sheet back, and the Sheet is shared Viewer-only.

The target file ID lives in .github/RADAR-CONFIG (gdrive_file_id). Not a secret,
since access is controlled by the Sheet's sharing settings.

Usage:
    python sync_gdrive_mirror.py --xlsx PATH --key-file PATH
        [--config .github/RADAR-CONFIG]

The service account key is read from a file path, never a CLI argument or
inline JSON -- so it never appears in shell history or process listings.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from radar_sync_common import DEFAULT_RADAR_CONFIG, load_radar_config

SCOPES = ["https://www.googleapis.com/auth/drive"]

# The narrower drive.file scope only sees files the service account created
# itself. A file shared with it through the Share dialog returns 404, not 403.
# The full drive scope plus the sharing grant reaches exactly the files shared
# with the account.


def push_to_drive(xlsx_path: Path, file_id: str, key_file: Path) -> None:
    creds = service_account.Credentials.from_service_account_file(str(key_file), scopes=SCOPES)
    drive = build("drive", "v3", credentials=creds)
    media = MediaFileUpload(
        str(xlsx_path),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        resumable=False,
    )
    drive.files().update(
        fileId=file_id,
        media_body=media,
        body={"mimeType": "application/vnd.google-apps.spreadsheet"},
    ).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xlsx", type=Path, required=True)
    parser.add_argument("--key-file", type=Path, required=True, help="Path to the service-account JSON key file")
    parser.add_argument("--config", type=Path, default=DEFAULT_RADAR_CONFIG)
    args = parser.parse_args()

    config = load_radar_config(args.config)
    file_id = config.get("gdrive_file_id")
    if not file_id:
        print(f"No gdrive_file_id in {args.config} -- nothing to sync.")
        sys.exit(1)

    push_to_drive(args.xlsx, file_id, args.key_file)
    print(f"Synced {args.xlsx} -> Google Sheet {file_id}")


if __name__ == "__main__":
    main()
