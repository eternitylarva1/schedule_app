#!/usr/bin/env python3
"""
Sync service-worker.js STATIC_ASSETS with index.html.

Reads all <script src> and <link href> tags from index.html,
extracts versioned asset paths, and updates service-worker.js.

Usage:
    python scripts/sync_sw_cache.py          # dry-run (show diff)
    python scripts/sync_sw_cache.py --write   # actually update the file
"""

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = PROJECT_ROOT / 'frontend' / 'index.html'
SW_FILE = PROJECT_ROOT / 'frontend' / 'service-worker.js'


def extract_assets_from_html() -> list[str]:
    """Extract static asset paths with version params from index.html."""
    html = INDEX_HTML.read_text(encoding='utf-8')
    assets = ['/', '/index.html']

    # <script src="/static/...js?v=xxx">
    for m in re.finditer(r'src="(/static/[^"]+\.js\?v=[^"]+)"', html):
        assets.append(m.group(1))

    # <link href="/static/...css?v=xxx">
    for m in re.finditer(r'href="(/static/[^"]+\.css\?v=[^"]+)"', html):
        assets.append(m.group(1))

    # <link rel="manifest" href="/manifest.json">
    for m in re.finditer(r'(?:href|src)="(/[^"]+\.(?:json|png|ico)[^"]*)"', html):
        path = m.group(1)
        # skip inline SVGs and data URIs
        if path.startswith('/') and path not in assets:
            assets.append(path)

    return assets


def read_current_assets_from_sw() -> list[str]:
    """Read the current STATIC_ASSETS list from service-worker.js."""
    sw = SW_FILE.read_text(encoding='utf-8')
    m = re.search(r'const STATIC_ASSETS = \[(.*?)\];', sw, re.DOTALL)
    if not m:
        raise ValueError('Could not find STATIC_ASSETS in service-worker.js')
    block = m.group(1)
    return [line.strip().strip(',').strip("'\"") for line in block.split('\n')
            if line.strip() and line.strip() != ',']


def format_assets(assets: list[str]) -> str:
    """Format asset list as JS array."""
    lines = []
    current_category = None
    for a in assets:
        if a == '/' or a == '/index.html':
            cat = 'root'
        elif a.startswith('/static/js/core/'):
            cat = 'core'
        elif a.startswith('/static/js/'):
            cat = 'modules'
        elif a.startswith('/static/styles/'):
            cat = 'css'
        else:
            cat = 'other'

        if cat != current_category:
            current_category = cat
            # Insert category comment
            comments = {
                'root': '\n  // Root',
                'core': '\n  // Core JS',
                'modules': '\n  // Feature modules',
                'css': '\n  // CSS',
                'other': '\n  // Other',
            }
            lines.append(comments[cat])

        lines.append(f"  '{a}',")

    return '\n'.join(lines)


def update_sw_file(assets: list[str], dry_run: bool = True) -> bool:
    """Replace STATIC_ASSETS in service-worker.js. Returns True if changed."""
    sw = SW_FILE.read_text(encoding='utf-8')
    formatted = format_assets(assets)

    new_sw = re.sub(
        r'const STATIC_ASSETS = \[.*?\];',
        f'const STATIC_ASSETS = [{formatted}\n];',
        sw,
        flags=re.DOTALL,
    )

    if new_sw == sw:
        return False

    if dry_run:
        print('── Would update STATIC_ASSETS ──')
        # Show diff
        old_list = set(read_current_assets_from_sw())
        new_list = set(assets)
        added = new_list - old_list
        removed = old_list - new_list
        if added:
            print(f'  + {len(added)} added: {", ".join(sorted(added))}')
        if removed:
            print(f'  - {len(removed)} removed: {", ".join(sorted(removed))}')
        print(f'  Total: {len(old_list)} → {len(new_list)} assets')
    else:
        SW_FILE.write_text(new_sw, encoding='utf-8')
        print(f'✅ Updated {SW_FILE.name} ({len(assets)} assets)')

    return True


def main():
    dry_run = '--write' not in sys.argv

    assets = extract_assets_from_html()
    changed = update_sw_file(assets, dry_run=dry_run)

    if dry_run and changed:
        print('\nRun with --write to apply changes.')
    elif not dry_run and not changed:
        print('✅ Already in sync.')
    elif dry_run and not changed:
        print('✅ Already in sync.')


if __name__ == '__main__':
    main()
