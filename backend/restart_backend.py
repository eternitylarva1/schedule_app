"""
后端一键重启脚本

用法：
    python restart_backend.py

功能：
    1. 找到并关闭当前运行在 8080 端口的后端
    2. 启动新的后端进程
    3. 确认启动成功
"""

import subprocess
import socket
import time
import sys
import os
import signal

# 配置
PORT = 8080
BACKEND_MODULE = "backend.main"
STARTUP_TIMEOUT = 10  # 等待后端启动的秒数


def is_port_in_use(port: int) -> bool:
    """检查端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def find_process_by_port(port: int) -> int | None:
    """通过端口找到进程 PID"""
    try:
        # Windows: 使用 netstat
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        for line in result.stdout.split("\n"):
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                for part in reversed(parts):
                    try:
                        pid = int(part)
                        return pid
                    except ValueError:
                        continue
    except Exception as e:
        print(f"查找进程失败: {e}")
    return None


def kill_process(pid: int) -> bool:
    """关闭指定进程"""
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], check=True)
        else:
            os.kill(pid, signal.SIGTERM)
        print(f"已关闭进程 PID: {pid}")
        return True
    except subprocess.CalledProcessError:
        print(f"无法关闭进程 {pid}，可能需要管理员权限")
        return False
    except PermissionError:
        print(f"权限不足，无法关闭进程 {pid}")
        return False
    except Exception as e:
        print(f"关闭进程失败: {e}")
        return False


def wait_for_port_free(port: int, timeout: int = 5) -> bool:
    """等待端口释放"""
    start = time.time()
    while time.time() - start < timeout:
        if not is_port_in_use(port):
            return True
        time.sleep(0.2)
    return False


def wait_for_port_ready(port: int, timeout: int = STARTUP_TIMEOUT) -> bool:
    """等待端口就绪（后端启动成功）"""
    start = time.time()
    while time.time() - start < timeout:
        if is_port_in_use(port):
            # 进一步验证 API 是否响应
            try:
                result = subprocess.run(
                    ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", f"http://localhost:{port}/api/events?date=today"],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.stdout.strip() in ["200", "301", "302"]:
                    return True
            except Exception:
                pass
        time.sleep(0.5)
    return False


def restart_backend():
    """重启后端"""
    print("=" * 40)
    print("后端重启脚本")
    print("=" * 40)
    
    # 检查当前端口状态
    if is_port_in_use(PORT):
        print(f"\n[1/4] 端口 {PORT} 已被占用，正在查找进程...")
        pid = find_process_by_port(PORT)
        if pid:
            print(f"[2/4] 找到进程 PID: {pid}，正在关闭...")
            if kill_process(pid):
                print(f"[3/4] 等待端口释放...")
                if wait_for_port_free(PORT):
                    print(f"端口 {PORT} 已释放")
                else:
                    print(f"警告：端口 {PORT} 未能及时释放")
            else:
                print("无法关闭后端进程，请手动关闭后重试")
                return False
        else:
            print("无法找到占用端口的进程，请手动关闭后重试")
            return False
    else:
        print(f"\n[1/4] 端口 {PORT} 当前空闲")
        print("[2/4] 跳过关闭步骤")
        print("[3/4] 跳过等待端口释放")
    
    # 启动后端
    print(f"\n[4/4] 启动后端...")
    
    # 获取项目根目录（backend 的上一级）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # backend 的父目录
    
    if sys.platform == "win32":
        # Windows: 启动新进程
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
        
        process = subprocess.Popen(
            [sys.executable, "-m", BACKEND_MODULE],
            cwd=project_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            startupinfo=startupinfo,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
        )
    else:
        # Unix: 后台运行
        process = subprocess.Popen(
            [sys.executable, "-m", BACKEND_MODULE],
            cwd=project_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    
    print(f"后端进程已启动 PID: {process.pid}")
    
    # 等待后端就绪
    print(f"等待后端启动（最多 {STARTUP_TIMEOUT} 秒）...")
    if wait_for_port_ready(PORT):
        print(f"\n[OK] Backend restarted successfully!")
        print(f"     Visit: http://localhost:{PORT}")
        return True
    else:
        print(f"\n[FAIL] Backend startup timeout, check logs")
        return False


if __name__ == "__main__":
    success = restart_backend()
    sys.exit(0 if success else 1)
