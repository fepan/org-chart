#!/bin/bash
# Portability tests for fetch-org.sh (macOS and Fedora/RHEL).
# Offline tests use a mock ldapsearch; set RUN_LIVE_LDAP=1 to hit real LDAP (.env required).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/fetch-org.sh"
RUNNER="${BASH:-bash}"
MOCK_BIN=$(mktemp -d)
OUT_DIR=$(mktemp -d)
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== fetch-org.sh portability tests ==="
echo "Platform: $(uname -s) $(uname -m)"
"$RUNNER" --version | head -1
echo

echo "--- Syntax ---"
if "$RUNNER" -n "$SCRIPT"; then
  pass "bash -n syntax check"
else
  fail "bash -n syntax check"
fi

echo "--- Usage ---"
usage_out=$("$RUNNER" "$SCRIPT" 2>&1 || true)
if echo "$usage_out" | grep -q "Usage:"; then
  pass "prints usage when called without args"
else
  fail "prints usage when called without args"
fi

echo "--- Mock LDAP org tree ---"
cat > "$MOCK_BIN/ldapsearch" <<'MOCK'
#!/bin/bash
args="$*"
case "$args" in
  *"(uid=__test__)"*) exit 0 ;;
  *"(uid=ceo)"*)
    cat <<'EOF'
dn: uid=ceo,ou=users,dc=example,dc=com
uid: ceo
cn: Alice CEO
title: Chief Executive

EOF
    ;;
  *"manager=uid=ceo"*)
    cat <<'EOF'
dn: uid=mgr1,ou=users,dc=example,dc=com
uid: mgr1
cn: Bob Manager
title: VP Engineering
manager: uid=ceo,ou=users,dc=example,dc=com

dn: uid=ic1,ou=users,dc=example,dc=com
uid: ic1
cn: Carol Engineer
title: Engineer
manager: uid=ceo,ou=users,dc=example,dc=com

EOF
    ;;
  *"manager=uid=mgr1"*)
    cat <<'EOF'
dn: uid=ic2,ou=users,dc=example,dc=com
uid: ic2
cn: Dan Engineer
title: Senior Engineer
manager: uid=mgr1,ou=users,dc=example,dc=com

EOF
    ;;
  *) exit 0 ;;
esac
MOCK
chmod +x "$MOCK_BIN/ldapsearch"

export PATH="$MOCK_BIN:$PATH"
export LDAP_SERVER=ldap://mock.example.com
export BASE_DN=dc=example,dc=com
export USER_BASE=ou=users,dc=example,dc=com

MOCK_OUT="$OUT_DIR/mock.csv"
if "$RUNNER" "$SCRIPT" ceo 999 "$MOCK_OUT" >/dev/null 2>&1; then
  lines=$(wc -l < "$MOCK_OUT" | tr -d ' ')
  if [ "$lines" = "5" ] && grep -q "Carol Engineer,Engineer,Alice CEO" "$MOCK_OUT"; then
    pass "mock LDAP fetch produced 4 people + header"
  else
    fail "mock LDAP CSV unexpected (lines=$lines)"
    head -10 "$MOCK_OUT" || true
  fi
else
  fail "mock LDAP fetch exited non-zero"
fi

if [ "${RUN_LIVE_LDAP:-0}" = "1" ]; then
  echo "--- Live LDAP (requires VPN + .env) ---"
  export PATH="${PATH#$MOCK_BIN:}"
  LIVE_OUT="$OUT_DIR/live.csv"
  if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
  fi
  LIVE_UID="${LIVE_LDAP_UID:-fpan}"
  LIVE_DEPTH="${LIVE_LDAP_DEPTH:-1}"
  if "$RUNNER" "$SCRIPT" "$LIVE_UID" "$LIVE_DEPTH" "$LIVE_OUT" >/dev/null 2>&1; then
    live_lines=$(wc -l < "$LIVE_OUT" | tr -d ' ')
    if [ "$live_lines" -ge 2 ]; then
      pass "live LDAP fetch for $LIVE_UID depth $LIVE_DEPTH ($((live_lines - 1)) people)"
    else
      fail "live LDAP fetch returned empty CSV"
    fi
  else
    fail "live LDAP fetch failed (VPN down or .env missing?)"
  fi
else
  echo "--- Live LDAP skipped (set RUN_LIVE_LDAP=1 to enable) ---"
fi

rm -rf "$MOCK_BIN" "$OUT_DIR"

echo
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
