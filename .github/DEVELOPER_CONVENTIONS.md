# Developer Conventions

Standard practices for naming and placing files, branches, settings and code in this repository. Rules
for working with an AI agent: [.github/DEVELOPER_AI_RULES.md](.github/DEVELOPER_AI_RULES.md).

## 1. Files with secrets or personal settings

### 1.a. Commit only the `.example` version

A file that holds secrets, tokens or machine-specific values has two versions:

| File | In git | Holds |
|---|---|---|
| `<name>.example.<ext>`, or `.env.example` | yes | placeholders, defaults and setup steps |
| `<name>.<ext>`, or `.env` | no, gitignored | the real values |

The developer copies the `.example` file and fills it in. 



A settings file with no secrets is committed under its real name, with no `.example` copy.

### 1.b. Add the real file to `.gitignore` in the same commit

Add the gitignore entry before the real file exists. Check with `git check-ignore -v <path>`.


## 2. Branches

`<type>/<Short_description>_<issue number>`, created from `origin/main`.

| Type | For |
|---|---|
| `feature/` | new functionality |
| `bug/` | a bug fix |
| `task/` | documentation, configuration, refactoring, maintenance |

Example: `bug/Error-with-deprecated-VT-radar-entry-1241`. Several issues: list the numbers,
e.g. `bugs/1244_1237_1190`.

## 3. Documentation

| Folder | Holds | In git |
|---|---|---|
| `developer_guides/` | final guides per feature: decisions and how it works | yes |
| `.github` | rules for working in this repo | yes |
| `user_guides/` | user guides | yes |
| `drafts/`| working notes, analysis and discussion per issue | no |

- Guides are upper case with underscores: `user_guides\VT_RADAR.md`.
- Committed guides never link to a file in `drafts/`.

## 4. Settings and variables

| Kind | Style | Example |
|---|---|---|
| environment variable | upper case with underscores | `MAIN_SITE_URL`, `USE_TEST_DB` |
| Python variable, function | snake_case | data_profile_id, build_data |

A new `.env` key is added to the matching `.env.example` in the same commit.

## 5. Scripts and tests

| Kind | Location |
|---|---|
| reusable repository scripts | `src/scripts/` |


One-time troubleshooting scripts stay outside the repository.

## 6. Comments

Say what the code does in plain words, then why, but be concise, no opinions. 
A fixed problem is cited by its GitHub issue number in parentheses, e.g. `(#1010)`, 
never by a file in `drafts/` or a test-session problem number.
