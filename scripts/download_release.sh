#!/bin/bash
# Download latest release and prepare for import
# Usage: ./download_release.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

BACKUP_DIR="$REPO_DIR/backup"
mkdir -p "$BACKUP_DIR"

if command -v gh &> /dev/null; then
    echo "Fetching latest release..."
    gh release download latest --dir "$BACKUP_DIR" --output "schedule_backup.json"
    echo "Downloaded to $BACKUP_DIR/schedule_backup.json"
else
    echo "GitHub CLI (gh) not found."
    echo "Please manually download from:"
    echo "  https://github.com/eternitylarva1/schedule_app/releases/latest"
    echo "Save the file as: $BACKUP_DIR/schedule_backup.json"
fi

echo "Then import via: http://localhost:8080 → 设置 → 数据备份 → 导入"
