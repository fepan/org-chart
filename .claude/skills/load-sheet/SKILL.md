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

The `data/` directory is gitignored, so downloaded files are safe from accidental commits.

### 3. Download and transform to CSV

Fetch the data using the values API and pipe through Python to extract, filter, and rename columns.

The org chart app requires columns named exactly `Name`, `Title`, and `Manager`. The source spreadsheet will have different column names. Use explicit mappings to connect source columns to output columns.

If the user specifies a filter (e.g., a specific pillar or team), apply it during extraction. If no filter is specified, include all rows.

Default sheet name is the one matching the `gid` in the URL. If no sheet name can be determined, default to `Sheet1`.

**Important:** In the Python script below, replace the ALL-CAPS placeholders before running:
- `SHEET_ID` — the spreadsheet ID extracted from the URL
- `SHEET_NAME` — the sheet/tab name (e.g., "Partners and Solutions")
- `OUTPUT_PATH` — the full path to the output CSV file
- `COLUMN_MAPPING` — a JSON object mapping **exact** source column headers to output column names. Example: `{"Name": "Name", "Current Title": "Title", "Planned Manager (If Changing)": "Manager"}`
- `FILTER_COLUMN` — the **exact** source column header to filter on (e.g., "Proposed Pillar"). Set to empty string `""` to skip filtering.
- `FILTER_MATCH` — the exact value to match (e.g., "Infrastructure (Rom)")

**Always read the header row first** to discover the actual column names. Do not assume column names from previous runs — spreadsheets change:

```bash
gws sheets spreadsheets values get \
  --params '{"spreadsheetId": "SHEET_ID", "range": "SHEET_NAME!1:1"}' --format json
```

Check the output and verify:
1. The filter column name (e.g., "Proposed Pillar") exists in the headers. If it doesn't, show the available headers and ask the user which column to filter on.
2. The column names used in `COLUMN_MAPPING` match the actual headers. If not, adjust the mapping.

Then build the mapping and run the extraction:

```bash
gws sheets spreadsheets values get \
  --params '{"spreadsheetId": "SHEET_ID", "range": "SHEET_NAME!A:Z"}' \
  --format json | python3 -c "
import json, sys, csv

data = json.load(sys.stdin)
rows = data.get('values', [])
header = rows[0]

# Explicit mapping: source column name -> output column name
col_map = COLUMN_MAPPING
filter_column = 'FILTER_COLUMN'
filter_value = 'FILTER_MATCH'

# Resolve header indices
col_indices = {}
filter_idx = -1
for i, h in enumerate(header):
    if h in col_map:
        col_indices[col_map[h]] = i
    if h == filter_column:
        filter_idx = i

# Validate filter column exists when filtering is requested
if filter_column and filter_idx == -1:
    print(f'ERROR: Filter column \"{filter_column}\" not found in headers.', file=sys.stderr)
    print(f'Available headers: {header}', file=sys.stderr)
    sys.exit(1)

# Validate all required output columns were mapped
output_cols = ['Name', 'Title', 'Manager']
for col in output_cols:
    if col not in col_indices:
        print(f'ERROR: Required column \"{col}\" not mapped. Check COLUMN_MAPPING.', file=sys.stderr)
        print(f'Available headers: {header}', file=sys.stderr)
        sys.exit(1)

max_col = max(list(col_indices.values()) + ([filter_idx] if filter_idx >= 0 else [0]))

matched = 0
with open('OUTPUT_PATH', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(output_cols)
    for row in rows[1:]:
        while len(row) <= max_col:
            row.append('')
        if filter_idx >= 0 and row[filter_idx].strip() != filter_value:
            continue
        matched += 1
        writer.writerow([row[col_indices.get(c, 0)] for c in output_cols])

print(f'Wrote {matched} rows (of {len(rows)-1} total)', file=sys.stderr)
if matched == 0:
    print(f'WARNING: No rows matched filter \"{filter_column}\" = \"{filter_value}\"', file=sys.stderr)
"
```

Verify the file is non-empty and has the correct header:

```bash
head -1 <project-root>/data/<filename>.csv
```

### 4. Provide the URL

The app supports auto-loading via a `?file=` URL parameter. Tell the user to open:

`http://localhost:8080?file=data/<filename>.csv`

To start the dev server if not already running:

```bash
python3 <project-root>/serve.py &>/dev/null &
```

## Common Issues

- **Auth error**: Run `! gws auth login` to re-authenticate
- **Wrong sheet name**: List sheets with `gws sheets spreadsheets get --params '{"spreadsheetId": "ID"}' --format json` and look for `sheets[].properties.title`
- **Missing columns**: The CSV must have `Name`, `Title`, and `Manager` columns. The skill auto-maps common variants (e.g., "Current Title" → "Title", "Planned Manager (If Changing)" → "Manager"). If no match is found, list the headers and ask the user which columns to use.
