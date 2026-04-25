#!/usr/bin/env python3
"""
Schedule App - Frontend Batch Test Program
基于 DEBUG_WORKFLOW.md 的前端批量测试

需要浏览器扩展支持。使用 OpenCode Browser 工具进行自动化测试。

用法:
    python frontend_test.py              # 运行所有前端测试
    python frontend_test.py --quick      # 仅快速检查
    python frontend_test.py --module calendar  # 仅测试日历模块
"""

import json
import time
import sys
import asyncio
from datetime import datetime
from typing import Dict, List, Tuple, Optional

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

class TestResult:
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.error = None
        self.start_time = time.time()
        self.end_time = None
        
    def finish(self, passed: bool, error: str = None):
        self.passed = passed
        self.error = error
        self.end_time = time.time()
        
    @property
    def duration(self) -> float:
        if self.end_time:
            return self.end_time - self.start_time
        return time.time() - self.start_time

class FrontendTester:
    FRONTEND_URL = "http://localhost:8080"
    
    def __init__(self):
        self.results: List[TestResult] = []
        self.tab_id: Optional[int] = None
        
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = {
            "INFO": f"{Colors.BLUE}[{timestamp}]{Colors.END}",
            "PASS": f"{Colors.GREEN}[{timestamp}]{Colors.END}",
            "FAIL": f"{Colors.RED}[{timestamp}]{Colors.END}",
            "WARN": f"{Colors.YELLOW}[{timestamp}]{Colors.END}",
        }.get(level, f"[{timestamp}]")
        print(f"{prefix} {msg}")
        
    async def init_browser(self):
        """初始化浏览器"""
        try:
            from browser_automation import browser_open_tab, browser_list_claims, browser_claim_tab
        except ImportError:
            self.log("需要 browser_automation 模块支持", "FAIL")
            return False
            
        # 列出当前tab
        tabs = await browser_list_claims()
        self.log(f"当前Tab: {tabs}")
        
        # 打开新tab
        self.tab_id = await browser_open_tab(self.FRONTEND_URL, active=True)
        self.log(f"打开Tab: {self.tab_id}", "PASS")
        
        if self.tab_id:
            return True
        return False
        
    async def close_browser(self):
        """关闭浏览器"""
        if self.tab_id:
            try:
                from browser_automation import browser_close_tab
                await browser_close_tab(self.tab_id)
            except:
                pass
        
    def run_test(self, name: str, test_func, *args, **kwargs) -> TestResult:
        """运行单个测试"""
        result = TestResult(name)
        self.log(f"Running: {name}")
        try:
            ok, msg = asyncio.get_event_loop().run_until_complete(test_func(*args, **kwargs))
            if ok:
                result.finish(True)
                self.log(f"✓ PASS: {name}", "PASS")
            else:
                result.finish(False, msg)
                self.log(f"✗ FAIL: {name} - {msg}", "FAIL")
        except Exception as e:
            result.finish(False, str(e))
            self.log(f"✗ ERROR: {name} - {e}", "FAIL")
        self.results.append(result)
        return result
        
    # ==================== DOM元素检查 ====================
    
    async def check_dom_element(self, selector: str) -> Tuple[bool, str]:
        """检查DOM元素是否存在"""
        try:
            from browser_automation import browser_query
            result = await browser_query(selector, limit=1, tabId=self.tab_id)
            if result:
                return True, ""
            return False, f"元素不存在: {selector}"
        except Exception as e:
            return False, str(e)
    
    async def test_calendar_elements(self) -> Tuple[bool, str]:
        """日历核心DOM元素检查"""
        elements = [
            "#dayView", "#weekView", "#monthView", "#todoView",
            "#calendarSegmented", "#daySlider", "#timeline",
            "#weekGrid", "#monthGrid", "#goalsView", "#notepadView"
        ]
        missing = []
        for sel in elements:
            ok, _ = await self.check_dom_element(sel)
            if not ok:
                missing.append(sel)
        if missing:
            return False, f"缺失元素: {missing}"
        return True, ""
    
    async def test_header_elements(self) -> Tuple[bool, str]:
        """头部元素检查"""
        elements = ["#headerTitle", "#prevBtn", "#nextBtn", "#refreshBtn"]
        missing = []
        for sel in elements:
            ok, _ = await self.check_dom_element(sel)
            if not ok:
                missing.append(sel)
        if missing:
            return False, f"缺失元素: {missing}"
        return True, ""
    
    async def test_tab_bar_elements(self) -> Tuple[bool, str]:
        """Tab栏元素检查"""
        elements = ["#tabDay", "#tabTodo", "#tabGoals", "#tabNotepad", "#tabAdd"]
        missing = []
        for sel in elements:
            ok, _ = await self.check_dom_element(sel)
            if not ok:
                missing.append(sel)
        if missing:
            return False, f"缺失元素: {missing}"
        return True, ""
    
    # ==================== 前端状态检查 ====================
    
    async def test_js_functions_exist(self) -> Tuple[bool, str]:
        """检查核心JS函数是否存在"""
        try:
            from browser_automation import browser_query
            functions = [
                "typeof switchView !== 'undefined'",
                "typeof loadData !== 'undefined'",
                "typeof renderTimeline !== 'undefined'",
                "typeof renderWeekView !== 'undefined'",
                "typeof renderMonthView !== 'undefined'",
                "typeof renderTodoView !== 'undefined'",
                "typeof bindEvents !== 'undefined'",
            ]
            missing = []
            for fn in functions:
                result = await browser_query(f"javascript:({fn})", tabId=self.tab_id)
                if not result:
                    missing.append(fn.split(' ')[0])
            if missing:
                return False, f"缺失函数: {missing}"
            return True, ""
        except Exception as e:
            return False, str(e)
    
    async def test_page_loads(self) -> Tuple[bool, str]:
        """页面加载检查"""
        try:
            from browser_automation import browser_snapshot
            snapshot = await browser_snapshot(tabId=self.tab_id)
            if snapshot and len(snapshot) > 100:
                return True, ""
            return False, "页面内容过少，可能未正常加载"
        except Exception as e:
            return False, str(e)
    
    # ==================== 交互测试 ====================
    
    async def test_tab_switch_day(self) -> Tuple[bool, str]:
        """Tab切换到日历"""
        try:
            from browser_automation import browser_click
            await browser_click("#tabDay", tabId=self.tab_id)
            await asyncio.sleep(0.5)
            
            from browser_automation import browser_query
            day_view = await browser_query("#dayView", limit=1, tabId=self.tab_id)
            if day_view:
                return True, ""
            return False, "切换到day后dayView不可见"
        except Exception as e:
            return False, str(e)
    
    async def test_tab_switch_todo(self) -> Tuple[bool, str]:
        """Tab切换到待办"""
        try:
            from browser_automation import browser_click
            await browser_click("#tabTodo", tabId=self.tab_id)
            await asyncio.sleep(0.5)
            
            from browser_automation import browser_query
            todo_view = await browser_query("#todoView", limit=1, tabId=self.tab_id)
            if todo_view:
                return True, ""
            return False, "切换到todo后todoView不可见"
        except Exception as e:
            return False, str(e)
    
    async def test_tab_switch_goals(self) -> Tuple[bool, str]:
        """Tab切换到规划"""
        try:
            from browser_automation import browser_click
            await browser_click("#tabGoals", tabId=self.tab_id)
            await asyncio.sleep(0.5)
            
            from browser_automation import browser_query
            goals_view = await browser_query("#goalsView", limit=1, tabId=self.tab_id)
            if goals_view:
                return True, ""
            return False, "切换到goals后goalsView不可见"
        except Exception as e:
            return False, str(e)
    
    async def test_tab_switch_notepad(self) -> Tuple[bool, str]:
        """Tab切换到记事本"""
        try:
            from browser_automation import browser_click
            await browser_click("#tabNotepad", tabId=self.tab_id)
            await asyncio.sleep(0.5)
            
            from browser_automation import browser_query
            notepad_view = await browser_query("#notepadView", limit=1, tabId=self.tab_id)
            if notepad_view:
                return True, ""
            return False, "切换到notepad后notepadView不可见"
        except Exception as e:
            return False, str(e)
    
    async def test_calendar_segmented(self) -> Tuple[bool, str]:
        """日历分段切换"""
        try:
            from browser_automation import browser_click
            # 点击week
            await browser_click(".cal-segment[data-subview='week']", tabId=self.tab_id)
            await asyncio.sleep(0.5)
            
            # 检查weekView可见
            from browser_automation import browser_query
            week_view = await browser_query("#weekView", limit=1, tabId=self.tab_id)
            if week_view:
                return True, ""
            return False, "切换到week后weekView不可见"
        except Exception as e:
            return False, str(e)
    
    # ==================== 控制台错误检查 ====================
    
    async def test_no_console_errors(self) -> Tuple[bool, str]:
        """检查控制台错误"""
        try:
            from browser_automation import browser_console, browser_errors
            errors = await browser_errors(tabId=self.tab_id)
            if errors and len(errors) > 0:
                return False, f"控制台有{len(errors)}个错误"
            return True, ""
        except Exception as e:
            # 如果获取失败不阻塞
            return True, f"无法获取控制台错误: {e}"
    
    # ==================== 测试运行 ====================
    
    async def run_quick_tests(self):
        """快速检查"""
        self.log("=" * 50, "INFO")
        self.log("前端快速检查", "INFO")
        self.log("=" * 50, "INFO")
        
        if not await self.init_browser():
            self.log("浏览器初始化失败", "FAIL")
            return False
        
        try:
            # 页面加载
            await self.run_test("Page Loads", self.test_page_loads)
            
            # 核心DOM
            await self.run_test("Calendar Elements", self.test_calendar_elements)
            await self.run_test("Header Elements", self.test_header_elements)
            await self.run_test("Tab Bar Elements", self.test_tab_bar_elements)
            
            # JS函数
            await self.run_test("JS Functions Exist", self.test_js_functions_exist)
            
            # 控制台错误
            await self.run_test("No Console Errors", self.test_no_console_errors)
            
        finally:
            await self.close_browser()
            
        return self.print_summary()
    
    async def run_full_tests(self):
        """完整测试"""
        self.log("=" * 50, "INFO")
        self.log("前端完整测试", "INFO")
        self.log("=" * 50, "INFO")
        
        if not await self.init_browser():
            self.log("浏览器初始化失败", "FAIL")
            return False
        
        try:
            # 页面加载
            await self.run_test("Page Loads", self.test_page_loads)
            
            # 核心DOM
            await self.run_test("Calendar Elements", self.test_calendar_elements)
            await self.run_test("Header Elements", self.test_header_elements)
            await self.run_test("Tab Bar Elements", self.test_tab_bar_elements)
            
            # JS函数
            await self.run_test("JS Functions Exist", self.test_js_functions_exist)
            
            # 控制台错误
            await self.run_test("No Console Errors", self.test_no_console_errors)
            
            # Tab切换
            await self.run_test("Tab Switch - Day", self.test_tab_switch_day)
            await self.run_test("Tab Switch - Todo", self.test_tab_switch_todo)
            await self.run_test("Tab Switch - Goals", self.test_tab_switch_goals)
            await self.run_test("Tab Switch - Notepad", self.test_tab_switch_notepad)
            
            # 日历分段
            await self.run_test("Calendar Segmented (Week)", self.test_calendar_segmented)
            
        finally:
            await self.close_browser()
            
        return self.print_summary()
    
    def print_summary(self) -> bool:
        """打印测试汇总"""
        self.log("\n" + "=" * 50, "INFO")
        self.log("前端测试汇总", "INFO")
        self.log("=" * 50, "INFO")
        
        passed = sum(1 for r in self.results if r.passed)
        failed = len(self.results) - passed
        total_time = sum(r.duration for r in self.results)
        
        self.log(f"总测试数: {len(self.results)}", "INFO")
        self.log(f"通过: {passed} {Colors.GREEN}✓{Colors.END}", "PASS" if passed > 0 else "INFO")
        self.log(f"失败: {failed} {Colors.RED}✗{Colors.END}", "FAIL" if failed > 0 else "INFO")
        self.log(f"总耗时: {total_time:.2f}s", "INFO")
        
        if failed > 0:
            self.log("\n失败详情:", "WARN")
            for r in self.results:
                if not r.passed:
                    self.log(f"  - {r.name}: {r.error}", "FAIL")
        
        return failed == 0


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Schedule App Frontend Test")
    parser.add_argument("--quick", action="store_true", help="仅运行快速检查")
    parser.add_argument("--url", default="http://localhost:8080", help="前端URL")
    args = parser.parse_args()
    
    tester = FrontendTester()
    tester.FRONTEND_URL = args.url
    
    if args.quick:
        success = asyncio.get_event_loop().run_until_complete(tester.run_quick_tests())
    else:
        success = asyncio.get_event_loop().run_until_complete(tester.run_full_tests())
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
