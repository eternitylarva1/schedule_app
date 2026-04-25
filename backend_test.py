#!/usr/bin/env python3
"""
Schedule App - Backend Batch Test Program
基于 DEBUG_WORKFLOW.md 的后端批量测试

用法:
    python backend_test.py              # 运行所有测试
    python backend_test.py --quick      # 仅快速健康检查
    python backend_test.py --module events  # 仅测试events模块
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, List, Tuple, Optional

BASE_URL = "http://localhost:8080"
TEST_USER_ID = 2674610176

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'
    
    @staticmethod
    def clean(msg: str) -> str:
        """清理消息中的特殊字符，避免Windows编码问题"""
        return msg.replace('\u2713', 'OK').replace('\u2717', 'X').replace('\u2714', '[OK]').replace('\u2718', '[X]')

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

class BackendTester:
    def __init__(self):
        self.results: List[TestResult] = []
        self.base_url = BASE_URL
        
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        msg = Colors.clean(msg)
        prefix = {
            "INFO": f"{Colors.BLUE}[{timestamp}]{Colors.END}",
            "PASS": f"{Colors.GREEN}[{timestamp}]{Colors.END}",
            "FAIL": f"{Colors.RED}[{timestamp}]{Colors.END}",
            "WARN": f"{Colors.YELLOW}[{timestamp}]{Colors.END}",
        }.get(level, f"[{timestamp}]")
        try:
            print(f"{prefix} {msg}")
        except UnicodeEncodeError:
            print(f"[{timestamp}] {msg}")
        
    def check_backend_alive(self) -> bool:
        """后端存活检查"""
        try:
            resp = requests.get(f"{self.base_url}/api/events?date=today", timeout=5)
            return resp.status_code == 200
        except:
            return False
    
    def run_test(self, name: str, test_func, *args, **kwargs) -> TestResult:
        """运行单个测试"""
        result = TestResult(name)
        self.log(f"Running: {name}")
        try:
            ok, msg = test_func(*args, **kwargs)
            if ok:
                result.finish(True)
                self.log(f"[PASS] {name}", "PASS")
            else:
                self.log(f"[FAIL] {name} - {msg}", "FAIL")
        except Exception as e:
            result.finish(False, str(e))
            self.log(f"✗ ERROR: {name} - {e}", "FAIL")
        self.results.append(result)
        return result
    
    # ==================== API健康检查 ====================
    
    def test_events_api_today(self) -> Tuple[bool, str]:
        """Events API - today"""
        resp = requests.get(f"{self.base_url}/api/events?date=today", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        if "data" not in data:
            return False, "missing data field"
        return True, ""
    
    def test_events_api_week(self) -> Tuple[bool, str]:
        """Events API - week"""
        resp = requests.get(f"{self.base_url}/api/events?date=week", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_events_api_month(self) -> Tuple[bool, str]:
        """Events API - month"""
        resp = requests.get(f"{self.base_url}/api/events?date=month", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_events_api_ym(self) -> Tuple[bool, str]:
        """Events API - YYYY-MM format"""
        resp = requests.get(f"{self.base_url}/api/events?date=2026-04", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_stats_api(self) -> Tuple[bool, str]:
        """Stats API"""
        resp = requests.get(f"{self.base_url}/api/stats?date=today", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_goals_api(self) -> Tuple[bool, str]:
        """Goals API"""
        resp = requests.get(f"{self.base_url}/api/goals?horizon=short", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_goals_semester_api(self) -> Tuple[bool, str]:
        """Goals API - semester"""
        resp = requests.get(f"{self.base_url}/api/goals?horizon=semester", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_goals_long_api(self) -> Tuple[bool, str]:
        """Goals API - long"""
        resp = requests.get(f"{self.base_url}/api/goals?horizon=long", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_expenses_api(self) -> Tuple[bool, str]:
        """Expenses API"""
        resp = requests.get(f"{self.base_url}/api/expenses?period=month", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_budgets_api(self) -> Tuple[bool, str]:
        """Budgets API"""
        resp = requests.get(f"{self.base_url}/api/budgets", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_notes_api(self) -> Tuple[bool, str]:
        """Notes API"""
        resp = requests.get(f"{self.base_url}/api/notes", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    def test_settings_api(self) -> Tuple[bool, str]:
        """Settings API"""
        resp = requests.get(f"{self.base_url}/api/settings", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"code != 0: {data}"
        return True, ""
    
    # ==================== 功能测试 ====================
    
    def test_create_event(self) -> Tuple[bool, str]:
        """创建事件"""
        payload = {
            "title": "测试事件",
            "start_time": "2026-04-26T10:00:00",
            "end_time": "2026-04-26T11:00:00",
            "category_id": "work",
            "is_test": True,
            "skip_conflict_check": True
        }
        resp = requests.post(f"{self.base_url}/api/events", json=payload, timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"create event failed: {data}"
        self._test_event_id = data.get("data", {}).get("id")
        return True, ""
    
    def test_update_event(self) -> Tuple[bool, str]:
        """更新事件"""
        if not hasattr(self, '_test_event_id'):
            return False, "no test event id"
        payload = {"title": "测试事件-已修改"}
        resp = requests.put(f"{self.base_url}/api/events/{self._test_event_id}", json=payload, timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"update event failed: {data}"
        return True, ""
    
    def test_complete_event(self) -> Tuple[bool, str]:
        """完成事件"""
        if not hasattr(self, '_test_event_id'):
            return False, "no test event id"
        resp = requests.put(f"{self.base_url}/api/events/{self._test_event_id}/complete", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"complete event failed: {data}"
        return True, ""
    
    def test_uncomplete_event(self) -> Tuple[bool, str]:
        """取消完成事件"""
        if not hasattr(self, '_test_event_id'):
            return False, "no test event id"
        resp = requests.put(f"{self.base_url}/api/events/{self._test_event_id}/uncomplete", timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"uncomplete event failed: {data}"
        return True, ""
    
    def test_create_expense(self) -> Tuple[bool, str]:
        """创建支出"""
        payload = {
            "amount": 1.0,
            "category": "food",
            "note": "测试支出",
            "is_test": True
        }
        resp = requests.post(f"{self.base_url}/api/expenses", json=payload, timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"create expense failed: {data}"
        self._test_expense_id = data.get("data", {}).get("id")
        return True, ""
    
    def test_create_budget(self) -> Tuple[bool, str]:
        """创建预算"""
        payload = {
            "name": "测试预算",
            "amount": 100.0,
            "is_test": True
        }
        resp = requests.post(f"{self.base_url}/api/budgets", json=payload, timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"create budget failed: {data}"
        self._test_budget_id = data.get("data", {}).get("id")
        return True, ""
    
    def test_create_goal(self) -> Tuple[bool, str]:
        """创建目标"""
        payload = {
            "title": "测试目标",
            "horizon": "short",
            "is_test": True
        }
        resp = requests.post(f"{self.base_url}/api/goals", json=payload, timeout=5)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"create goal failed: {data}"
        self._test_goal_id = data.get("data", {}).get("id")
        return True, ""
    
    def test_cleanup_test_data(self) -> Tuple[bool, str]:
        """清理测试数据"""
        resp = requests.post(f"{self.base_url}/api/settings/cleanup_test_entries", json={}, timeout=10)
        data = resp.json()
        if data.get("code") != 0:
            return False, f"cleanup failed: {data}"
        return True, f"deleted: events={data['data'].get('events_deleted',0)}, expenses={data['data'].get('expenses_deleted',0)}, budgets={data['data'].get('budgets_deleted',0)}"
    
    # ==================== 测试运行 ====================
    
    def run_quick_tests(self):
        """快速健康检查"""
        self.log("=" * 50, "INFO")
        self.log("快速健康检查 (3分钟)", "INFO")
        self.log("=" * 50, "INFO")
        
        # 后端存活
        if not self.check_backend_alive():
            self.log("后端未启动或不可达!", "FAIL")
            return False
        self.log("后端存活检查: OK", "PASS")
        
        # 核心API检查
        quick_tests = [
            ("Events API (today)", self.test_events_api_today),
            ("Events API (week)", self.test_events_api_week),
            ("Events API (month)", self.test_events_api_month),
            ("Stats API", self.test_stats_api),
            ("Goals API", self.test_goals_api),
            ("Expenses API", self.test_expenses_api),
            ("Budgets API", self.test_budgets_api),
        ]
        
        for name, func in quick_tests:
            self.run_test(name, func)
            
        return self.print_summary()
    
    def run_full_tests(self):
        """完整测试"""
        self.log("=" * 50, "INFO")
        self.log("完整后端测试", "INFO")
        self.log("=" * 50, "INFO")
        
        # 后端存活
        if not self.check_backend_alive():
            self.log("后端未启动或不可达!", "FAIL")
            return False
        self.log("后端存活检查: OK", "PASS")
        
        # API健康检查
        api_tests = [
            ("Events API (today)", self.test_events_api_today),
            ("Events API (week)", self.test_events_api_week),
            ("Events API (month)", self.test_events_api_month),
            ("Events API (YYYY-MM)", self.test_events_api_ym),
            ("Stats API", self.test_stats_api),
            ("Goals API (short)", self.test_goals_api),
            ("Goals API (semester)", self.test_goals_semester_api),
            ("Goals API (long)", self.test_goals_long_api),
            ("Expenses API", self.test_expenses_api),
            ("Budgets API", self.test_budgets_api),
            ("Notes API", self.test_notes_api),
            ("Settings API", self.test_settings_api),
        ]
        
        self.log("\n--- API健康检查 ---", "INFO")
        for name, func in api_tests:
            self.run_test(name, func)
        
        # 功能测试
        self.log("\n--- 功能测试 ---", "INFO")
        func_tests = [
            ("Create Event", self.test_create_event),
            ("Update Event", self.test_update_event),
            ("Complete Event", self.test_complete_event),
            ("Uncomplete Event", self.test_uncomplete_event),
            ("Create Expense", self.test_create_expense),
            ("Create Budget", self.test_create_budget),
            ("Create Goal", self.test_create_goal),
        ]
        
        for name, func in func_tests:
            self.run_test(name, func)
        
        # 清理
        self.log("\n--- 清理测试数据 ---", "INFO")
        self.run_test("Cleanup Test Data", self.test_cleanup_test_data)
        
        return self.print_summary()
    
    def print_summary(self) -> bool:
        """打印测试汇总"""
        self.log("\n" + "=" * 50, "INFO")
        self.log("测试汇总", "INFO")
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
    parser = argparse.ArgumentParser(description="Schedule App Backend Test")
    parser.add_argument("--quick", action="store_true", help="仅运行快速健康检查")
    parser.add_argument("--url", default="http://localhost:8080", help="后端URL")
    args = parser.parse_args()
    
    tester = BackendTester()
    tester.base_url = args.url
    
    if args.quick:
        success = tester.run_quick_tests()
    else:
        success = tester.run_full_tests()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
