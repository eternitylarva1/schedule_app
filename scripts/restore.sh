#!/bin/bash
# Restore script - pull latest backup from private GitHub repo
# Usage: ./restore.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "Pulling latest backup..."
git pull origin main

# If server is running, offer to import via API
if curl -s "http://localhost:8080/api/backup/export" &>/dev/null; then
    echo "Server running - you can restore via web UI"
    echo "Or import via: curl -X POST http://localhost:8080/api/backup/import -d @backup/schedule_backup.json"
fi

echo "Restore complete. Restart server if needed."
