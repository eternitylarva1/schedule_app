#!/usr/bin/env python3
"""Reset auth: delete auth and auth_tokens tables to allow fresh password setup.

Run from project root:
    python3 scripts/reset_auth.py
"""
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "backend" / "schedule.db"


def main():
    if not DB_PATH.exists():
        print("数据库文件不存在，无需重置。")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check if auth table has any records
    cur.execute("SELECT COUNT(*) FROM auth")
    auth_count = cur.fetchone()[0]

    if auth_count == 0:
        print("无需重置：当前无密码设置，直接打开应用即可重新设置。")
        conn.close()
        return

    # Delete auth tokens first (foreign key order), then auth
    cur.execute("DELETE FROM auth_tokens")
    tokens_deleted = cur.rowcount
    cur.execute("DELETE FROM auth")
    auth_deleted = cur.rowcount
    conn.commit()
    conn.close()

    print(f"已重置密码：已删除 {auth_deleted} 条 auth 记录、{tokens_deleted} 条 auth_tokens 记录。")
    print("下次打开应用将引导重新设置密码。")


if __name__ == "__main__":
    main()
