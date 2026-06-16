#!/bin/bash
#
# Fetch an org chart from LDAP and output CSV for the org-chart viewer.
#
# Usage:
#   ./fetch-org.sh <uid>              # full org tree
#   ./fetch-org.sh <uid> 2            # limit to 2 levels deep
#   ./fetch-org.sh <uid> 2 out.csv    # write to specific file
#
# Requires: ldapsearch, LDAP connectivity
#
# Output CSV columns: Name, Title, Manager
# Default output: data/<uid>.csv
#
# Fetches one LDAP query per tree level (typically 6-8 queries total),
# not one per person.
#
# Configure these for your environment:

set -euo pipefail

LDAP_SERVER="${LDAP_SERVER:-ldap://ldap.example.com}"
BASE_DN="${BASE_DN:-dc=example,dc=com}"
USER_BASE="${USER_BASE:-ou=users,dc=example,dc=com}"

usage() {
    echo "Usage: $0 <uid> [max-depth] [output-file]"
    echo ""
    echo "  uid          LDAP uid (e.g. jsmith)"
    echo "  max-depth    How many levels below the manager to fetch (default: all)"
    echo "  output-file  Where to write the CSV (default: data/<uid>.csv)"
    exit 1
}

if [ $# -lt 1 ]; then usage; fi

ROOT_UID="$1"

if ! [[ "$ROOT_UID" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Error: uid contains invalid characters (letters, digits, . _ - only)" >&2
    exit 1
fi
MAX_DEPTH="${2:-999}"
OUTFILE="${3:-data/${ROOT_UID}.csv}"

if ! command -v ldapsearch &>/dev/null; then
    echo "Error: ldapsearch not found. Install openldap-clients." >&2
    exit 1
fi

ldapsearch -x -H "$LDAP_SERVER" -b "$BASE_DN" "(uid=__test__)" uid &>/dev/null || {
    echo "Error: Cannot reach LDAP server. Check your network connectivity." >&2
    exit 1
}

csv_escape() {
    local val="$1"
    if [[ "$val" == *,* || "$val" == *\"* ]]; then
        val="${val//\"/\"\"}"
        echo "\"$val\""
    else
        echo "$val"
    fi
}

# Parse ldapsearch output into tab-separated records: uid \t cn \t title
parse_people() {
    awk '
        /^uid:/ { uid=$2 }
        /^cn:/ { sub(/^cn: /,""); cn=$0 }
        /^title:/ { sub(/^title: /,""); title=$0 }
        /^$/ {
            if(uid && cn) { print uid "\t" cn "\t" title }
            uid=""; cn=""; title=""
        }
        END { if(uid && cn) print uid "\t" cn "\t" title }
    '
}

mkdir -p "$(dirname "$OUTFILE")"
echo "Fetching org chart for '$ROOT_UID' (max depth: $MAX_DEPTH)..." >&2

# Step 1: Fetch root person
root_info=$(ldapsearch -x -H "$LDAP_SERVER" -b "$BASE_DN" "(uid=$ROOT_UID)" uid cn title 2>/dev/null | parse_people)

if [ -z "$root_info" ]; then
    echo "Error: uid '$ROOT_UID' not found in LDAP" >&2
    exit 1
fi

root_name=$(echo "$root_info" | cut -f2)
root_title=$(echo "$root_info" | cut -f3)

# uid->name and uid->title maps (associative arrays)
declare -A NAME_MAP TITLE_MAP MANAGER_MAP
NAME_MAP["$ROOT_UID"]="$root_name"
TITLE_MAP["$ROOT_UID"]="$root_title"
MANAGER_MAP["$ROOT_UID"]=""

COUNT=1
echo "  [depth 0] 1 person (root: $root_name)" >&2

# Step 2: Batch fetch level by level
current_uids=("$ROOT_UID")
depth=0

while [ "$depth" -lt "$MAX_DEPTH" ] && [ ${#current_uids[@]} -gt 0 ]; do
    # Build OR filter for all managers at this level
    filter=""
    for uid in "${current_uids[@]}"; do
        filter+="(manager=uid=${uid},${USER_BASE})"
    done

    if [ ${#current_uids[@]} -eq 1 ]; then
        search_filter="$filter"
    else
        search_filter="(|${filter})"
    fi

    # One query for ALL reports of ALL managers at this level
    level_results=$(ldapsearch -x -H "$LDAP_SERVER" -b "$BASE_DN" -z 0 \
        "$search_filter" uid cn title manager 2>/dev/null | awk '
        /^uid:/ { uid=$2 }
        /^cn:/ { sub(/^cn: /,""); cn=$0 }
        /^title:/ { sub(/^title: /,""); title=$0 }
        /^manager:/ { sub(/^manager: /,""); mgr=$0; sub(/,ou=.*/, "", mgr); sub(/^uid=/, "", mgr) }
        /^$/ {
            if(uid && cn) { print uid "\t" cn "\t" title "\t" mgr }
            uid=""; cn=""; title=""; mgr=""
        }
        END { if(uid && cn) print uid "\t" cn "\t" title "\t" mgr }
    ')

    if [ -z "$level_results" ]; then break; fi

    next_uids=()
    level_count=0

    while IFS=$'\t' read -r uid name title mgr_uid; do
        if [ -n "$uid" ] && [ -z "${NAME_MAP[$uid]+x}" ]; then
            NAME_MAP["$uid"]="$name"
            TITLE_MAP["$uid"]="$title"
            MANAGER_MAP["$uid"]="$mgr_uid"
            next_uids+=("$uid")
            level_count=$((level_count + 1))
        fi
    done <<< "$level_results"

    COUNT=$((COUNT + level_count))
    depth=$((depth + 1))

    if [ $level_count -gt 0 ]; then
        echo "  [depth $depth] $level_count people ($COUNT total)" >&2
    fi

    current_uids=("${next_uids[@]+"${next_uids[@]}"}")
done

# Step 3: Write CSV
{
    echo "Name,Title,Manager"
    for uid in "${!NAME_MAP[@]}"; do
        name="${NAME_MAP[$uid]}"
        title="${TITLE_MAP[$uid]}"
        mgr_uid="${MANAGER_MAP[$uid]}"
        mgr_name=""
        if [ -n "$mgr_uid" ] && [ -n "${NAME_MAP[$mgr_uid]+x}" ]; then
            mgr_name="${NAME_MAP[$mgr_uid]}"
        fi
        echo "$(csv_escape "$name"),$(csv_escape "$title"),$(csv_escape "$mgr_name")"
    done
} > "$OUTFILE"

echo "" >&2
echo "Done! $COUNT people written to $OUTFILE" >&2
echo "View: http://localhost:8080?file=$OUTFILE" >&2
