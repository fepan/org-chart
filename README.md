# Org Chart Viewer

A lightweight, interactive org chart viewer that renders a CSV file as a visual tree. Zero dependencies, no build step — just open in a browser.

## Running Locally

Open `index.html` directly in your browser, or serve it locally:

```bash
python3 serve.py
```

Then open http://localhost:8080. This also enables the LDAP import feature.

## Usage

1. Click **Upload CSV** and select a CSV file with columns: `Name`, `Title`, `Manager`
2. The org chart renders as an interactive tree

### CSV Format

```csv
Name,Title,Manager
Alice,CEO,
Bob,VP Engineering,Alice
Carol,Senior Engineer,Bob
```

### Controls

- **Expand All** — expand the entire tree
- **Managers Only** — show only the management chain (hide ICs)
- **Collapse All** — collapse everything
- **Show: Collaborative Partners / Interns** — optional checkboxes to include these roles (hidden by default)

### Auto-Load from URL

Append `?file=<path>` to load a CSV automatically:

```
http://localhost:8080?file=data/my-org.csv
```

Personal CSV files go in the `data/` directory, which is gitignored.

### Import from Google Sheets

Use `load-sheet.sh` to download a Google Spreadsheet as CSV:

```bash
./load-sheet.sh                          # use defaults from .env
./load-sheet.sh --sheet "Rom v2"         # different sheet/tab
./load-sheet.sh --filter "My Team"       # override filter value
./load-sheet.sh --no-filter              # download all rows
./load-sheet.sh --out my-org             # custom output filename
```

Configure the spreadsheet ID, column mappings, and filter in `.env` (see `.env.example`).

### Claude Code Skill: `/load-sheet`

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), the included `/load-sheet` skill downloads a Google Spreadsheet as CSV and provides the auto-load URL.

```
/load-sheet 'My Spreadsheet Name' use Sheet1
```

Requires the [`gws` CLI](https://github.com/nicholasgasior/gws) to be installed and authenticated (`gws auth login`).

### Interactions

- **Click** a manager card — expand/collapse one level
- **ⓘ icon** or **right-click** — open the edit panel to change title, manager, or view reports

### Import from LDAP

Click **Import LDAP** in the toolbar to fetch an org chart from a corporate LDAP directory. Enter a user's uid and optionally limit the depth.

This requires `ldapsearch` (e.g. `openldap-clients`) and the dev server (`python3 serve.py`).

Configure your LDAP connection by copying the example env file:

```bash
cp .env.example .env
# edit .env with your server details
```

Or export the variables directly: `LDAP_SERVER`, `BASE_DN`, `USER_BASE`.
