#!/usr/bin/env python3
import subprocess
import sys
import os

def run_git(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def main():
    commit_msg = sys.argv[1] if len(sys.argv) > 1 else None
    
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    run_git(['git', 'add', '.'])
    
    code, stdout, stderr = run_git(['git', 'status'])
    print(stdout)
    if code != 0:
        print(f"Error: {stderr}")
        return 1
    
    summary = run_git(['git', 'diff', '--cached', '--stat'])[1]
    print("\nStaged changes:")
    print(summary)
    
    if not summary.strip() or "nothing to commit" in summary.lower():
        print("No changes to commit.")
        return 0
    
    branch = run_git(['git', 'branch', '--show-current'])[1].strip()
    default_msg = f"Update on {branch}"
    
    if not commit_msg:
        print(f"\nDefault: '{default_msg}'")
        print("Enter commit message (or press Enter for default):")
        commit_msg = input().strip() or default_msg
    else:
        print(f"\nUsing: '{commit_msg}'")
    
    success, msg = run_git(['git', 'commit', '-m', commit_msg])[:2]
    if not success:
        print(f"Commit failed: {msg}")
        return 1
    print("Committed!")
    
    success, msg = run_git(['git', 'push', 'origin', 'main'])[:2]
    if not success:
        print(f"Push failed: {msg}")
        return 1
    print("Pushed!")
    print("\nDone!")
    return 0

if __name__ == "__main__":
    sys.exit(main())