---
name: load-ldap
description: "Import an org chart from LDAP. Given a manager's name or uid, fetches their org tree and loads it into the viewer as CSV."
---

# Load Org Chart from LDAP

Fetch a manager's organization from corporate LDAP and load it into the org chart viewer.

## Prerequisites

- `ldapsearch` installed (e.g. `openldap-clients`)
- LDAP server reachable (configure `LDAP_SERVER`, `BASE_DN`, `USER_BASE` env vars or edit `fetch-org.sh`)
- The dev server running (`python3 serve.py`)

## Arguments

The user provides a manager's name or uid. They may also provide:
- A **depth** to limit how many levels deep to fetch (default: all)
- A **filename** for the output CSV

## Steps

### 1. Find the manager

If the user provided a uid, use it directly. If they provided a name, search for them:

```
search_people(query="<NAME>", attributes=["uid", "cn", "title", "manager"])
```

Confirm the match with the user if multiple results come back.

### 2. Fetch the org chart

Call get_organization_chart to pull the full hierarchy:

```
get_organization_chart(manager_uid="<UID>", depth=<DEPTH>)
```

This returns a hierarchical structure with each person's name, title, uid, and their direct reports.

If `get_organization_chart` is not available or fails, build the tree manually:

```
find_direct_reports(manager_uid="<UID>")
```

Then recursively call `find_direct_reports` for each manager in the results, up to the requested depth.

### 3. Enrich with details (optional)

For key people (the root manager and their directs), fetch full details:

```
get_person_details(uid="<UID>", attributes=["cn", "title", "l", "mail"])
```

### 4. Generate CSV

Convert the hierarchical data into CSV format with columns: `Name`, `Title`, `Manager`

Write the CSV to `data/<uid>.csv`:

```bash
cat > data/<uid>.csv << 'EOF'
Name,Title,Manager
<ROOT_NAME>,<ROOT_TITLE>,
<DIRECT1_NAME>,<DIRECT1_TITLE>,<ROOT_NAME>
...
EOF
```

Verify the file:

```bash
head data/<uid>.csv
wc -l data/<uid>.csv
```

### 5. Load into viewer

Start the dev server if not running:

```bash
python3 serve.py &>/dev/null &
```

Tell the user to open:

`http://localhost:8080?file=data/<uid>.csv`

### 6. Iterative refinement

After the initial load, the user may want to:
- **Adjust depth**: Re-fetch with a different depth limit
- **Add people**: Manually add individuals via the edit panel
- **Reorganize**: Use the edit panel to adjust reporting lines
- **Export**: Save the refined org chart as CSV

## Troubleshooting

- **"Connection refused"**: Check network connectivity to the LDAP server.
- **"No results found"**: Check the uid spelling. Try `search_people` with a partial name.
- **"Timeout"**: Large orgs may take time. Try limiting depth (e.g., depth=2).

## Example

```
/load-ldap jsmith
/load-ldap "Jane Smith" depth=3
```

This searches for the manager, fetches their org tree, generates CSV, and provides the auto-load URL.
