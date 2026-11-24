# Updating the VT Radar

The VANTAGE Technology Radar (VT Radar) is maintained through the **VT Radar Curator** at
**https://medgalia.github.io/ALAF/**. Anyone can browse it. Editing needs a GitHub account with write access to this repository, granted to VANTAGE Working Group collaborators.

Edits are not immediately added to the VT Radar. Every change becomes a pull request that another curator reviews and merges.

| You want to | Go to |
|---|---|
| Look something up | [Browse](#browse), no sign-in needed |
| Change a resource, or write a summary | [Curator: edit the radar](#curator-edit-the-radar) |
| Approve someone else's change | [Reviewer: approve and merge](#reviewer-approve-and-merge) |
| Work in Excel instead | [Alternative route: upload the spreadsheet](#alternative-route-upload-the-spreadsheet) |

## Browse

Open https://medgalia.github.io/ALAF/. The table opens on the `Knowledgebase` sheet.

- **Search** matches resource name, URL and organization.
- **Filters** narrow by sheet, type and maturity. `Needs verification` shows rows that are unverified or over a year old. `Has summary` shows rows that have a written summary.
- Each row shows **Verified**, **Stale** or **Unverified**, with who verified it and when.
- Click a resource name to see all its fields. Click the blue **Summary** badge to open its summary directly.

## Curator: edit the radar

### 1. Sign in with your own token

The site signs you in with a GitHub personal access token rather than a password. **Create your own; never share one.** The token is your identity here: `Added/Edited By`, `Verified By` and `reviewed_by` are all stamped with the handle that owns it.

You create the token once. It stays valid until it expires, and you paste it into the site once per browser session.

1. Go to https://github.com/settings/personal-access-tokens/new
2. **Token name:** anything, for example `ALAF curator UI`.
3. **Resource owner:** select **MEDGALIA**. Not your personal account, or the token cannot see this repository.
4. **Repository access:** *Only select repositories*, then **MEDGALIA/ALAF**.
5. **Repository permissions**, set three:
   - **Contents:** Read and write
   - **Pull requests:** Read and write
   - **Actions:** Read and write
   
   `Metadata: Read-only` is added automatically and cannot be removed.
6. **Generate token** and copy it. GitHub shows it once.

Then click **Sign in to edit** on the site and paste it. Your avatar and a `Can edit` badge appear.

The token is held for that browser tab only and is gone when you close it, so expect to paste it again next session. Keep your copy somewhere safe, such as a password manager, or generate a fresh one when it expires.

### 2. Change a resource

1. Click the resource name to open it.
2. Edit the fields. Dropdowns and checkboxes come from the controlled vocabulary, so you cannot enter a term the radar does not recognize.
3. **ID**, **Added/Edited By**, **Last Updated**, **Verified By** and **Last Verified** are shown but cannot be edited. The pipeline writes those.
4. Use **Open** beside the URL to check the resource in a new tab.
5. Click **Stage edit**. The row gets a `Staged` badge.

Staging does not submit anything. Repeat for as many rows as you like, then submit once.

### 3. Write or edit a summary

A summary is a short Markdown note about the resource, shown in the panel.

1. Open the resource. If it has no summary you will see **No summary yet** and a **Write summary** button. If it has one, expand `Summary` and click **Edit summary**.
2. Write in the **Write** tab, check it in the **Preview** tab.
3. Click **Stage summary**.

Do not type the `---` header block. Your handle and today's date are written for you, and the reviewer's name is filled in when the change is approved.

### 4. Submit

Click **Open pull request** in `Staged edits`. A link to the pull request appears. Your edits are now waiting for a reviewer, and your staged list is cleared.

### 5. Mark rows verified

Verification records that a human opened the resource and confirmed it is still accurate. It is separate from editing, so you can re-confirm a row that nobody has changed.

1. Tick the checkbox on each row you have personally checked.
2. Click **Mark verified**.

Your handle and today's date are written to those rows directly, with no pull request. Only curators listed in [`.github/CODEOWNERS`](../.github/CODEOWNERS) can do this; the check runs on the server, so the button fails for anyone else.

Editing a row's content clears its verification again, because the earlier check no longer covers the new text.

## Reviewer: approve and merge

For curators listed in [`.github/CODEOWNERS`](../.github/CODEOWNERS). **Approving is the act of verifying.** You never type into `Verified By`.

Work in the `Pending review` panel on the site, or on github.com.

1. If the Checks tab says *"N workflows awaiting approval"*, click **Approve workflows to run**. This only releases the automation and records nothing about verification. See [Approving workflow runs from forks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks).
2. Read the change and open the resource links to check them.
3. Click **Approve & merge** on the site. On github.com it is **Files changed** → **Review changes** → **Approve** → **Submit review**, then **Merge pull request**.
4. Confirm the header reads **Merged** in purple, not "Closed" in red.

Within about a minute a commit from `vt-radar-verification-bot` lands on `main` and writes:

- `Verified By` and `Last Verified` on rows that changed and had no verification, using your handle and the date you approved.
- `reviewed_by` in the front matter of any summary file the pull request changed.

The bot also comments on the pull request saying what it stamped.

**You cannot approve your own pull request.** GitHub blocks this for everyone, including admins. Another curator has to review it.

**Bulk or mechanical edits:** if you did not check the resources row by row, add the **`no-verify`** label before merging and nothing will be stamped.

Two different "Approve" buttons exist. Only the one in step 3 is the review. Step 1's button just releases the automation.

## Alternative route: upload the spreadsheet

The curator UI is the normal way in, but editing the workbook still works and is a better fit for bulk changes across many rows. Everything happens through github.com, with no `git` command line.

1. **Download and edit.** Get `data/VANTAGE-Technology-Radar.xlsx` from the repository, edit it in Excel, and save it under the same name, `VANTAGE-Technology-Radar.xlsx`. Respect the `Vocabulary` tab when editing.
2. **Go to the `data/` folder on github.com.** Stay in the folder listing; "Upload files" is not offered from inside a file.
3. **Upload your copy.** "Add file" → "Upload files", or drag the file onto the page. The filename must match exactly so it replaces the old one.
4. **Click "Propose changes"**, accepting the branch name offered. This opens a pull request.
5. **Click "Create pull request"** on the next page.
6. **Wait for the sync.** GitHub converts your workbook into the machine-readable JSON and adds it as a second commit on your pull request. You will see **Merging is blocked** until a curator approves.
7. **A curator reviews, approves and merges**, exactly as above.

### Rules the sync applies on its own

- **Leave `Verified By` and `Last Verified` alone.** Changing a row clears them, and they are filled back in from the approval. Do not type your own name, or anyone else's.
- **Every row has an `ID`** in column A that you should not touch. It is how the sync recognizes a row across edits. Leave it blank on a new row and one is assigned.
- **Moving a row between tabs:** copy the *entire* row including its `ID` into the destination tab, then delete it from the original. With the `ID` carried across, the sync sees a move rather than a deletion.
- **Deleting a row outright** blocks the pull request until a repository admin approves. If you are unsure whether something should be deleted or moved to `Deprecated`, ask first.
- **Structure is checked first.** If a column is renamed, removed or reordered, the sync refuses to run and you will need to fix the workbook and upload again. Edit cell *values*, not headers or their order. To propose a schema change, open an issue.
- **`Added/Edited By`** is set to your GitHub handle on any row you actually changed.

Do not hand-edit the files under `data/json/`. They are generated from the workbook.

## Use GitHub Issues for Errors or Questions

Open an issue on the repository, or contact a curator. 
