#!/usr/bin/env python3
"""
Schedule App - 一键测试入口
运行后端 + 前端所有测试，并生成报告

用法:
    python run_tests.py              # 运行所有测试
    python run_tests.py --backend    # 仅后端测试
    python run_tests.py --frontend   # 仅前端测试
    python run_tests.py --quick      # 快速检查
    python run_tests.py --report     # 生成报告
"""

import subprocess
import sys
import json
import time
import os
from datetime import datetime
from typing import Dict, List, Optional

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'

class TestReport:
    def __init__(self):
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.backend_results: Dict = {}
        self.frontend_results: Dict = {}
        self.report_path = f"test_report_{self.timestamp}.txt"
        
    def save(self):
        """保存JSON格式报告"""
        report_json = {
            "timestamp": self.timestamp,
            "backend": self.backend_results,
            "frontend": self.frontend_results
        }
        json_path = self.report_path.replace(".txt", ".json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report_json, f, ensure_ascii=False, indent=2)
        return json_path
        
    def load_from_json(self, json_path: str):
        """从JSON加载报告"""
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.timestamp = data.get("timestamp", "")
        self.backend_results = data.get("backend", {})
        self.frontend_results = data.get("frontend", {})

class TestRunner:
    BACKEND_TEST_FILE = "backend_test.py"
    FRONTEND_TEST_FILE = "frontend_test.py"
    
    def __init__(self):
        self.backend_ok = False
        self.frontend_ok = False
        self.report = TestReport()
        
    def log(self, msg: str, level: str = "INFO"):
        prefix = {
            "INFO": f"{Colors.BLUE}[TEST]{Colors.END}",
            "OK": f"{Colors.GREEN}[OK]{Colors.END}",
            "FAIL": f"{Colors.RED}[FAIL]{Colors.END}",
            "WARN": f"{Colors.YELLOW}[WARN]{Colors.END}",
            "TITLE": f"{Colors.CYAN}{Colors.BOLD}",
        }.get(level, "[TEST]")
        print(f"{prefix} {msg}{Colors.END}")
        
    def check_backend_alive(self) -> bool:
        """检查后端是否运行"""
        try:
            import requests
            resp = requests.get("http://localhost:8080/api/events?date=today", timeout=3)
            return resp.status_code == 200
        except:
            return False
            
    def run_backend_test(self, quick: bool = False) -> bool:
        """运行后端测试"""
        self.log("=" * 60, "TITLE")
        self.log("后端测试", "TITLE")
        self.log("=" * 60, "TITLE")
        
        if not self.check_backend_alive():
            self.log("后端未启动! 请先运行: python backend/main.py", "FAIL")
            self.report.backend_results = {"status": "failed", "reason": "backend not running"}
            return False
        
        cmd = [sys.executable, self.BACKEND_TEST_FILE]
        if quick:
            cmd.append("--quick")
        
        self.log(f"运行: {' '.join(cmd)}", "INFO")
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            # 解析输出
            output = result.stdout + result.stderr
            print(output)
            
            # 判断结果
            if result.returncode == 0:
                self.log("后端测试全部通过!", "OK")
                self.report.backend_results = {"status": "passed", "output": output[-500:]}
                return True
            else:
                self.log("后端测试有失败项!", "FAIL")
                self.report.backend_results = {"status": "failed", "output": output[-500:]}
                return False
        except subprocess.TimeoutExpired:
            self.log("后端测试超时!", "FAIL")
            self.report.backend_results = {"status": "failed", "reason": "timeout"}
            return False
        except Exception as e:
            self.log(f"后端测试异常: {e}", "FAIL")
            self.report.backend_results = {"status": "failed", "reason": str(e)}
            return False
    
    def run_frontend_test(self, quick: bool = False) -> bool:
        """运行前端测试"""
        self.log("=" * 60, "TITLE")
        self.log("前端测试", "TITLE")
        self.log("=" * 60, "TITLE")
        
        cmd = [sys.executable, self.FRONTEND_TEST_FILE]
        if quick:
            cmd.append("--quick")
        
        self.log(f"运行: {' '.join(cmd)}", "INFO")
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            
            # 解析输出
            output = result.stdout + result.stderr
            print(output)
            
            # 判断结果
            if result.returncode == 0:
                self.log("前端测试全部通过!", "OK")
                self.report.frontend_results = {"status": "passed", "output": output[-500:]}
                return True
            else:
                self.log("前端测试有失败项!", "FAIL")
                self.report.frontend_results = {"status": "failed", "output": output[-500:]}
                return False
        except subprocess.TimeoutExpired:
            self.log("前端测试超时!", "FAIL")
            self.report.frontend_results = {"status": "failed", "reason": "timeout"}
            return False
        except Exception as e:
            self.log(f"前端测试异常: {e}", "FAIL")
            self.report.frontend_results = {"status": "failed", "reason": str(e)}
            return False
    
    def print_final_summary(self):
        """打印最终汇总"""
        print("\n" + "=" * 60)
        print(f"{Colors.BOLD}测试汇总{Colors.END}")
        print("=" * 60)
        
        print(f"后端测试: {Colors.GREEN}通过{Colors.END}" if self.backend_ok else f"后端测试: {Colors.RED}失败{Colors.END}")
        print(f"前端测试: {Colors.GREEN}通过{Colors.END}" if self.frontend_ok else f"前端测试: {Colors.RED}失败{Colors.END}")
        
        if self.backend_ok and self.frontend_ok:
            print(f"\n{Colors.GREEN}{Colors.BOLD}✓ 所有测试通过!{Colors.END}")
        else:
            print(f"\n{Colors.RED}{Colors.BOLD}✗ 部分测试失败{Colors.END}")
        
        # 保存报告
        json_path = self.report.save()
        print(f"\n报告已保存: {json_path}")
        
    def run_all(self, backend_only: bool = False, frontend_only: bool = False, quick: bool = False):
        """运行所有测试"""
        print(f"\n{Colors.CYAN}{Colors.BOLD}{'=' * 60}")
        print("Schedule App 一键测试")
        print(f"{'=' * 60}{Colors.END}\n")
        
        if not backend_only and not frontend_only:
            # 运行全部测试
            self.backend_ok = self.run_backend_test(quick)
            print("\n")
            self.frontend_ok = self.run_frontend_test(quick)
        elif backend_only:
            self.backend_ok = self.run_backend_test(quick)
            self.frontend_ok = True  # 跳过
        elif frontend_only:
            self.frontend_ok = self.run_frontend_test(quick)
            self.backend_ok = True  # 跳过
            
        self.print_final_summary()
        
        return self.backend_ok and self.frontend_ok


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Schedule App 一键测试")
    parser.add_argument("--backend", action="store_true", help="仅后端测试")
    parser.add_argument("--frontend", action="store_true", help="仅前端测试")
    parser.add_argument("--quick", action="store_true", help="快速检查")
    args = parser.parse_args()
    
    runner = TestRunner()
    success = runner.run_all(
        backend_only=args.backend,
        frontend_only=args.frontend,
        quick=args.quick
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
