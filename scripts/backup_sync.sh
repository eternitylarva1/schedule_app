#!/bin/bash
# Auto backup script - commit schedule.db to private GitHub repo
# Usage: ./backup_sync.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEDULE_DB="$REPO_DIR/backend/schedule.db"
BACKUP_JSON="$REPO_DIR/backup/schedule_backup.json"
PRIVATE_REPO="git@github.com:eternitylarva1/schedule_backup.git"

cd "$REPO_DIR"

# Ensure backup directory exists
mkdir -p "$REPO_DIR/backup"

# Export current database to JSON for human-readable diff
if command -v curl &> /dev/null && curl -s "http://localhost:8080/api/backup/export" &> /dev/null; then
    curl -s "http://localhost:8080/api/backup/export" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
with open('$BACKUP_JSON', 'w') as f:
    json.dump(resp.get('data', {}), f, ensure_ascii=False, indent=2)
" 2>/dev/null || true
fi

# Check if there are changes
if git diff --quiet && git diff --cached --quiet 2>/dev/null; then
    echo "No changes to commit"
    exit 0
fi

# Commit with timestamp
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
git add backend/schedule.db backup/schedule_backup.json 2>/dev/null || git add backend/schedule.db

git commit -m "Auto backup: $TIMESTAMP" --allow-empty

# Push to private repo
git push origin main 2>/dev/null || echo "Push failed - check remote"

echo "Backup committed: $TIMESTAMP"
