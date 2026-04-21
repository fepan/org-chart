---
name: load-sheet
description: "Use when loading a Google Spreadsheet into the org chart viewer, or when the user wants to view org data from Google Sheets."
---

# Load Google Sheet into Org Chart

Download a Google Spreadsheet as CSV and load it into the org chart viewer.

## Prerequisites

- `gws` CLI installed and authenticated (`gws auth login`)
- `/browse` skill available for browser interaction

## Steps

### 1. Get the spreadsheet

If the user provided a Google Sheets URL, extract the spreadsheet ID from it. The ID is the long string between `/d/` and `/edit` in URLs like:
`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`

If the user provided a raw ID, use it directly. If neither was provided, ask.

If the user provided a spreadsheet name instead of an ID, search for it:

```bash
gws drive files list --params '{"q": "name contains '\''SEARCH_TERM'\'' and mimeType='\''application/vnd.google-apps.spreadsheet'\''", "pageSize": 5}' --format table
```

If the user specified a sheet name within the spreadsheet, list available sheets to find it:

```bash
gws sheets spreadsheets get --params '{"spreadsheetId": "ID", "fields": "sheets.properties.title"}' --format table
```

### 2. Determine the filename

Derive a short, URL-friendly filename from the spreadsheet name:
- Lowercase, replace spaces/special chars with hyphens, strip consecutive hyphens, trim leading/trailing hyphens
- Append `.csv`
- Example: "My Org Chart 2026" → `my-org-chart-2026.csv`

Make sure the filename is added to `.gitignore` if it isn't already (these are personal data files that shouldn't be committed).

### 3. Download as CSV

Use the raw values API (not `+read`, which doesn't support `--format csv` properly):

```bash
gws sheets spreadsheets values get --params '{"spreadsheetId": "ID", "range": "SheetName"}' --format csv 2>/dev/null > <project-root>/<filename>.csv
```

Default to `Sheet1` if no sheet name was specified.

Verify the file is non-empty and contains the expected columns (Name, Title, Manager):

```bash
head -1 <project-root>/<filename>.csv
```

### 4. Provide the URL

The app supports auto-loading via a `?file=` URL parameter. Tell the user to open:

`http://localhost:8080?file=<filename>.csv`

To start the dev server if not already running:

```bash
python3 -m http.server 8080 &>/dev/null &
```

## Common Issues

- **Auth error**: Run `! gws auth login` to re-authenticate
- **Wrong sheet name**: List sheets with `gws sheets spreadsheets get --params '{"spreadsheetId": "ID"}' --format json` and look for `sheets[].properties.title`
- **Missing columns**: The CSV must have `Name`, `Title`, and `Manager` columns. If the sheet uses different column names, the user needs to rename them in the spreadsheet.
