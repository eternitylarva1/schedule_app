#!/bin/bash
# Create GitHub Release with backup data
# Usage: ./create_release.sh [version_tag]
# Example: ./create_release.sh 2026-06-13

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

VERSION=${1:-$(date +%Y-%m-%d)}
BACKUP_FILE="$REPO_DIR/backup/schedule_backup.json"
SCHEDULE_DB="$REPO_DIR/backend/schedule.db"

# Ensure backup directory exists
mkdir -p "$REPO_DIR/backup"

# Export database to JSON
echo "Exporting database..."
curl -s "http://localhost:8080/api/backup/export" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
with open('$BACKUP_FILE', 'w') as f:
    json.dump(resp.get('data', {}), f, ensure_ascii=False, indent=2)
print('Exported to $BACKUP_FILE')
"

# Create GitHub release with tag
# Uses GitHub CLI if available, otherwise creates a draft release via API
if command -v gh &> /dev/null; then
    echo "Creating GitHub release v$VERSION..."
    gh release create "v$VERSION" \
        --title "Schedule Backup $VERSION" \
        --notes "Auto backup created at $VERSION" \
        "$BACKUP_FILE" \
        "$SCHEDULE_DB"
else
    echo "GitHub CLI (gh) not found. Please install from: https://cli.github.com/"
    echo "Or manually create a release at: https://github.com/eternitylarva1/schedule_app/releases/new"
    echo "Upload these files:"
    echo "  - $BACKUP_FILE"
    echo "  - $SCHEDULE_DB"
fi

echo "Done! Release v$VERSION created."
