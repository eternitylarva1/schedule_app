#!/usr/bin/env python3
"""
Unified test runner for Schedule App.

Usage:
    python run_tests.py
    python run_tests.py --backend
    python run_tests.py --frontend
    python run_tests.py --quick
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional


BASE_DIR = Path(__file__).resolve().parent
BACKEND_TEST_FILE = BASE_DIR / "backend_test.py"
FRONTEND_TEST_FILE = BASE_DIR / "frontend_test.py"
BACKEND_HEALTH_URL = "http://localhost:8080/api/events?date=today"


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    END = "\033[0m"


@dataclass
class TestReport:
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y%m%d_%H%M%S"))
    backend: Dict = field(default_factory=dict)
    frontend: Dict = field(default_factory=dict)

    def save(self, base_dir: Path) -> Path:
        path = base_dir / f"test_report_{self.timestamp}.json"
        with path.open("w", encoding="utf-8") as f:
            json.dump(
                {
                    "timestamp": self.timestamp,
                    "backend": self.backend,
                    "frontend": self.frontend,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
        return path


class Runner:
    def __init__(self) -> None:
        self.report = TestReport()
        self.backend_ok = False
        self.frontend_ok = False

    def log(self, message: str, level: str = "INFO") -> None:
        prefix = {
            "INFO": f"{Colors.BLUE}[TEST]{Colors.END}",
            "OK": f"{Colors.GREEN}[OK]{Colors.END}",
            "FAIL": f"{Colors.RED}[FAIL]{Colors.END}",
            "WARN": f"{Colors.YELLOW}[WARN]{Colors.END}",
            "TITLE": f"{Colors.CYAN}{Colors.BOLD}",
        }.get(level, "[TEST]")
        self._safe_print(f"{prefix} {message}{Colors.END if level == 'TITLE' else ''}")

    def _safe_print(self, text: str) -> None:
        try:
            print(text)
        except UnicodeEncodeError:
            encoding = sys.stdout.encoding or "utf-8"
            sanitized = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
            print(sanitized)

    def _run_subprocess(self, cmd: list[str], timeout_s: int) -> tuple[bool, str]:
        self.log(f"Running: {' '.join(cmd)}")
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout_s,
                cwd=str(BASE_DIR),
            )
        except subprocess.TimeoutExpired:
            return False, f"Timeout after {timeout_s}s"
        except Exception as e:
            return False, f"Execution error: {e}"

        output = (proc.stdout or "") + (proc.stderr or "")
        self._safe_print(output)
        return proc.returncode == 0, output

    def _check_backend_alive(self) -> bool:
        try:
            import requests

            resp = requests.get(BACKEND_HEALTH_URL, timeout=3)
            return resp.status_code == 200
        except Exception:
            return False

    def run_backend(self, quick: bool) -> bool:
        self.log("=" * 60, "TITLE")
        self.log("Backend tests", "TITLE")
        self.log("=" * 60, "TITLE")

        if not self._check_backend_alive():
            reason = "Backend is not running. Start it with: python -m backend.main"
            self.log(reason, "FAIL")
            self.report.backend = {"status": "failed", "reason": reason}
            return False

        cmd = [sys.executable, str(BACKEND_TEST_FILE)]
        if quick:
            cmd.append("--quick")
        ok, output = self._run_subprocess(cmd, timeout_s=180)
        self.report.backend = {"status": "passed" if ok else "failed", "output_tail": output[-1500:]}
        self.log("Backend tests passed." if ok else "Backend tests failed.", "OK" if ok else "FAIL")
        return ok

    def run_frontend(self, quick: bool) -> bool:
        self.log("=" * 60, "TITLE")
        self.log("Frontend tests", "TITLE")
        self.log("=" * 60, "TITLE")

        cmd = [sys.executable, str(FRONTEND_TEST_FILE)]
        if quick:
            cmd.append("--quick")
        ok, output = self._run_subprocess(cmd, timeout_s=240)
        self.report.frontend = {"status": "passed" if ok else "failed", "output_tail": output[-1500:]}
        self.log("Frontend tests passed." if ok else "Frontend tests failed.", "OK" if ok else "FAIL")
        return ok

    def summary(self) -> bool:
        print("\n" + "=" * 60)
        print(f"{Colors.BOLD}Test Summary{Colors.END}")
        print("=" * 60)
        print(f"Backend:  {'PASS' if self.backend_ok else 'FAIL'}")
        print(f"Frontend: {'PASS' if self.frontend_ok else 'FAIL'}")
        all_ok = self.backend_ok and self.frontend_ok
        print(f"\n{'[PASS] All tests passed.' if all_ok else '[FAIL] Some tests failed.'}")
        report_path = self.report.save(BASE_DIR)
        print(f"Report: {report_path}")
        return all_ok

    def run_all(self, backend_only: bool, frontend_only: bool, quick: bool) -> bool:
        print(f"\n{Colors.CYAN}{Colors.BOLD}{'=' * 60}")
        print("Schedule App - Unified Test Runner")
        print(f"{'=' * 60}{Colors.END}\n")

        if backend_only:
            self.backend_ok = self.run_backend(quick)
            self.frontend_ok = True
        elif frontend_only:
            self.frontend_ok = self.run_frontend(quick)
            self.backend_ok = True
        else:
            self.backend_ok = self.run_backend(quick)
            print()
            self.frontend_ok = self.run_frontend(quick)

        return self.summary()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Schedule App unified tests")
    parser.add_argument("--backend", action="store_true", help="Run backend tests only")
    parser.add_argument("--frontend", action="store_true", help="Run frontend tests only")
    parser.add_argument("--quick", action="store_true", help="Run quick checks")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    runner = Runner()
    ok = runner.run_all(backend_only=args.backend, frontend_only=args.frontend, quick=args.quick)
    raise SystemExit(0 if ok else 1)
