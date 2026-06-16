#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "Copy .env.example to .env and fill in your values." >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

# Strip surrounding quotes (the .env file may quote values)
for var in SPREADSHEET_ID SHEET_NAME COL_NAME COL_TITLE COL_MANAGER \
           FILTER_COLUMN FILTER_VALUE OUTPUT_NAME SERVER_PORT; do
  val="${!var:-}"
  val="${val#\"}" ; val="${val%\"}"
  val="${val#\'}" ; val="${val%\'}"
  printf -v "$var" '%s' "$val"
done

NO_FILTER=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sheet)    SHEET_NAME="$2"; shift 2 ;;
    --filter)   FILTER_VALUE="$2"; shift 2 ;;
    --no-filter) FILTER_VALUE=""; NO_FILTER=true; shift ;;
    --out)      OUTPUT_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--sheet NAME] [--filter VALUE] [--no-filter] [--out NAME]"
      echo ""
      echo "Options:"
      echo "  --sheet NAME    Sheet/tab name (default: from .env)"
      echo "  --filter VALUE  Filter value for FILTER_COLUMN (default: from .env)"
      echo "  --no-filter     Download all rows, ignore filter"
      echo "  --out NAME      Output filename without .csv (default: derived from sheet name)"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "${OUTPUT_NAME:-}" ]]; then
  OUTPUT_NAME=$(echo "$SHEET_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
fi

OUTPUT_PATH="$SCRIPT_DIR/data/${OUTPUT_NAME}.csv"
mkdir -p "$SCRIPT_DIR/data"

echo "Downloading sheet \"$SHEET_NAME\"..."
if [[ -n "${FILTER_VALUE:-}" ]]; then
  echo "Filtering: $FILTER_COLUMN = \"$FILTER_VALUE\""
fi

gws sheets spreadsheets values get \
  --params "{\"spreadsheetId\": \"$SPREADSHEET_ID\", \"range\": \"${SHEET_NAME}!A:Z\"}" \
  --format json 2>/dev/null | python3 -c "
import json, sys, csv

data = json.load(sys.stdin)
rows = data.get('values', [])
if not rows:
    print('ERROR: No data returned from spreadsheet.', file=sys.stderr)
    sys.exit(1)

header = rows[0]

col_map = {
    '$COL_NAME': 'Name',
    '$COL_TITLE': 'Title',
    '$COL_MANAGER': 'Manager',
}
filter_column = '$FILTER_COLUMN'
filter_value = '$FILTER_VALUE'

col_indices = {}
filter_idx = -1
for i, h in enumerate(header):
    if h in col_map:
        col_indices[col_map[h]] = i
    if h == filter_column:
        filter_idx = i

output_cols = ['Name', 'Title', 'Manager']
for col in output_cols:
    if col not in col_indices:
        print(f'ERROR: Required column \"{col}\" not mapped. Check config.', file=sys.stderr)
        print(f'Available headers: {header}', file=sys.stderr)
        sys.exit(1)

if filter_value and filter_idx == -1:
    print(f'ERROR: Filter column \"{filter_column}\" not found.', file=sys.stderr)
    print(f'Available headers: {header}', file=sys.stderr)
    sys.exit(1)

max_col = max(list(col_indices.values()) + ([filter_idx] if filter_idx >= 0 else [0]))

matched = 0
with open('$OUTPUT_PATH', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(output_cols)
    for row in rows[1:]:
        while len(row) <= max_col:
            row.append('')
        if filter_value and filter_idx >= 0 and row[filter_idx].strip() != filter_value:
            continue
        matched += 1
        writer.writerow([row[col_indices.get(c, 0)] for c in output_cols])

print(f'Wrote {matched} rows (of {len(rows)-1} total)', file=sys.stderr)
if matched == 0:
    print(f'WARNING: No rows matched filter.', file=sys.stderr)
"

if ! pgrep -f "serve.py" > /dev/null 2>&1; then
  echo "Starting dev server on port ${SERVER_PORT}..."
  python3 "$SCRIPT_DIR/serve.py" &>/dev/null &
  sleep 0.5
fi

echo ""
echo "http://localhost:${SERVER_PORT}?file=data/${OUTPUT_NAME}.csv"
