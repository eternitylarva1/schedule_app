#!/usr/bin/env python3
"""
Schedule App - Frontend Batch Test Program (Playwright edition)

This version intentionally does NOT depend on the legacy `browser_automation`
module. It uses Playwright directly for browser-driven UI checks.

Usage:
    python frontend_test.py
    python frontend_test.py --quick
    python frontend_test.py --url http://localhost:8080
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, List, Optional, Tuple

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page, async_playwright


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    END = "\033[0m"


@dataclass
class TestResult:
    name: str
    passed: bool = False
    error: Optional[str] = None
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def duration(self) -> float:
        if self.end_time > 0:
            return self.end_time - self.start_time
        return 0.0


class FrontendTester:
    def __init__(self, frontend_url: str):
        self.frontend_url = frontend_url.rstrip("/")
        self.results: List[TestResult] = []
        self.console_errors: List[str] = []
        self.page_errors: List[str] = []

        self._pw = None
        self._browser = None
        self._context = None
        self.page: Optional[Page] = None

    def log(self, msg: str, level: str = "INFO") -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = {
            "INFO": f"{Colors.BLUE}[{timestamp}]{Colors.END}",
            "PASS": f"{Colors.GREEN}[{timestamp}]{Colors.END}",
            "FAIL": f"{Colors.RED}[{timestamp}]{Colors.END}",
            "WARN": f"{Colors.YELLOW}[{timestamp}]{Colors.END}",
        }.get(level, f"[{timestamp}]")
        print(f"{prefix} {msg}")

    async def init_browser(self) -> bool:
        try:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(headless=True)
            self._context = await self._browser.new_context(ignore_https_errors=True)
            self.page = await self._context.new_page()

            self.page.on("console", self._on_console_message)
            self.page.on("pageerror", self._on_page_error)

            await self.page.goto(self.frontend_url, wait_until="domcontentloaded", timeout=30000)
            await self.page.wait_for_load_state("load")
            # Page includes SW/cache reset-once logic; give it a short settle window.
            await self.page.wait_for_timeout(1200)
            # Ignore transient console noise during initial self-reload.
            self.console_errors.clear()
            self.page_errors.clear()
            return True
        except PlaywrightError as e:
            self.log(f"Browser init failed: {e}", "FAIL")
            self.log("If Chromium is missing, run: python -m playwright install chromium", "WARN")
            return False
        except Exception as e:
            self.log(f"Browser init failed: {e}", "FAIL")
            return False

    async def close_browser(self) -> None:
        try:
            if self._context:
                await self._context.close()
            if self._browser:
                await self._browser.close()
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass

    def _on_console_message(self, message) -> None:
        if message.type == "error":
            self.console_errors.append(message.text)

    def _on_page_error(self, error) -> None:
        self.page_errors.append(str(error))

    async def run_test(self, name: str, test_func: Callable[[], Awaitable[Tuple[bool, str]]]) -> TestResult:
        result = TestResult(name=name, start_time=time.time())
        self.log(f"Running: {name}")
        try:
            ok, msg = await test_func()
            result.passed = ok
            result.error = msg or None
            if ok:
                self.log(f"PASS: {name}", "PASS")
            else:
                self.log(f"FAIL: {name} - {msg}", "FAIL")
        except Exception as e:
            result.passed = False
            result.error = str(e)
            self.log(f"ERROR: {name} - {e}", "FAIL")
        finally:
            result.end_time = time.time()
            self.results.append(result)
        return result

    async def _exists(self, selector: str) -> bool:
        assert self.page is not None
        return (await self.page.locator(selector).count()) > 0

    async def _is_visible_view(self, selector: str) -> bool:
        assert self.page is not None
        if not await self._exists(selector):
            return False
        locator = self.page.locator(selector).first
        hidden = await locator.evaluate("el => el.classList.contains('hidden')")
        return not bool(hidden)

    async def _click(self, selector: str) -> None:
        assert self.page is not None
        await self.page.locator(selector).first.click(timeout=10000)
        await self.page.wait_for_timeout(350)

    async def test_page_loads(self) -> Tuple[bool, str]:
        assert self.page is not None
        title = await self.page.title()
        html = await self.page.content()
        if not title.strip():
            return False, "empty page title"
        if len(html) < 800:
            return False, "page HTML too short; likely not loaded correctly"
        return True, ""

    async def test_calendar_elements(self) -> Tuple[bool, str]:
        selectors = [
            "#dayView",
            "#weekView",
            "#monthView",
            "#todoView",
            "#calendarSegmented",
            "#timeline",
            "#weekGrid",
            "#monthGrid",
            "#goalsView",
            "#notepadView",
        ]
        missing = [sel for sel in selectors if not await self._exists(sel)]
        if missing:
            return False, f"missing elements: {missing}"
        return True, ""

    async def test_header_elements(self) -> Tuple[bool, str]:
        selectors = ["#headerTitle", "#refreshBtn", "#settingsBtn"]
        missing = [sel for sel in selectors if not await self._exists(sel)]
        if missing:
            return False, f"missing elements: {missing}"
        return True, ""

    async def test_tab_bar_elements(self) -> Tuple[bool, str]:
        selectors = ["#tabDay", "#tabTodo", "#tabGoals", "#tabNotepad"]
        missing = [sel for sel in selectors if not await self._exists(sel)]
        if missing:
            return False, f"missing elements: {missing}"
        return True, ""

    async def test_tab_switch_day(self) -> Tuple[bool, str]:
        await self._click("#tabDay")
        if await self._is_visible_view("#dayView"):
            return True, ""
        return False, "dayView not visible after clicking day tab"

    async def test_tab_switch_todo(self) -> Tuple[bool, str]:
        await self._click("#tabTodo")
        if await self._is_visible_view("#todoView"):
            return True, ""
        return False, "todoView not visible after clicking todo tab"

    async def test_tab_switch_goals(self) -> Tuple[bool, str]:
        await self._click("#tabGoals")
        if await self._is_visible_view("#goalsView"):
            return True, ""
        return False, "goalsView not visible after clicking goals tab"

    async def test_tab_switch_notepad(self) -> Tuple[bool, str]:
        await self._click("#tabNotepad")
        if await self._is_visible_view("#notepadView"):
            return True, ""
        return False, "notepadView not visible after clicking notepad tab"

    async def test_calendar_segmented_week(self) -> Tuple[bool, str]:
        await self._click("#tabDay")
        await self._click(".cal-segment[data-subview='week']")
        if await self._is_visible_view("#weekView"):
            return True, ""
        return False, "weekView not visible after switching calendar segment"

    async def test_no_console_errors(self) -> Tuple[bool, str]:
        ignored_markers = [
            "TypeError: Failed to fetch",
            "Network Error",
        ]
        all_errors = []
        for error in self.console_errors + self.page_errors:
            if any(marker in error for marker in ignored_markers):
                continue
            all_errors.append(error)
        if all_errors:
            preview = "; ".join(all_errors[:3])
            return False, f"console/page errors found: {preview}"
        return True, ""

    async def run_quick_tests(self) -> bool:
        self.log("=" * 50, "INFO")
        self.log("Frontend quick checks (Playwright)", "INFO")
        self.log("=" * 50, "INFO")
        if not await self.init_browser():
            return False
        try:
            await self.run_test("Page Loads", self.test_page_loads)
            await self.run_test("Calendar Elements", self.test_calendar_elements)
            await self.run_test("Header Elements", self.test_header_elements)
            await self.run_test("Tab Bar Elements", self.test_tab_bar_elements)
            await self.run_test("No Console Errors", self.test_no_console_errors)
        finally:
            await self.close_browser()
        return self.print_summary()

    async def run_full_tests(self) -> bool:
        self.log("=" * 50, "INFO")
        self.log("Frontend full checks (Playwright)", "INFO")
        self.log("=" * 50, "INFO")
        if not await self.init_browser():
            return False
        try:
            await self.run_test("Page Loads", self.test_page_loads)
            await self.run_test("Calendar Elements", self.test_calendar_elements)
            await self.run_test("Header Elements", self.test_header_elements)
            await self.run_test("Tab Bar Elements", self.test_tab_bar_elements)
            await self.run_test("No Console Errors", self.test_no_console_errors)
            await self.run_test("Tab Switch - Day", self.test_tab_switch_day)
            await self.run_test("Tab Switch - Todo", self.test_tab_switch_todo)
            await self.run_test("Tab Switch - Goals", self.test_tab_switch_goals)
            await self.run_test("Tab Switch - Notepad", self.test_tab_switch_notepad)
            await self.run_test("Calendar Segmented - Week", self.test_calendar_segmented_week)
        finally:
            await self.close_browser()
        return self.print_summary()

    def print_summary(self) -> bool:
        self.log("\n" + "=" * 50, "INFO")
        self.log("Frontend test summary", "INFO")
        self.log("=" * 50, "INFO")

        passed = sum(1 for r in self.results if r.passed)
        failed = len(self.results) - passed
        total_time = sum(r.duration for r in self.results)

        self.log(f"Total tests: {len(self.results)}", "INFO")
        self.log(f"Passed: {passed}", "PASS" if passed else "INFO")
        self.log(f"Failed: {failed}", "FAIL" if failed else "INFO")
        self.log(f"Total time: {total_time:.2f}s", "INFO")

        if failed:
            self.log("Failed details:", "WARN")
            for result in self.results:
                if not result.passed:
                    self.log(f"- {result.name}: {result.error}", "FAIL")

        return failed == 0


async def main_async(args: argparse.Namespace) -> int:
    tester = FrontendTester(args.url)
    success = await (tester.run_quick_tests() if args.quick else tester.run_full_tests())
    return 0 if success else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Schedule App Frontend Test (Playwright)")
    parser.add_argument("--quick", action="store_true", help="Run only quick checks")
    parser.add_argument("--url", default="http://localhost:8080", help="Frontend URL")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async(parse_args())))
