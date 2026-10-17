#!/usr/bin/env python3
"""
Unified dev launcher for Cotrade.
Starts the backend (Python) and frontend (Vite) together in one process.

Usage:
    python dev.py              # start both servers
    python dev.py --port 3000  # custom backend port
"""

import argparse
import os
import signal
import subprocess
import sys
import time

_root = os.path.dirname(os.path.abspath(__file__))
_frontend_dir = os.path.join(_root, "frontend")

# Make sure child processes die with us on Ctrl+C.
def _setup_signals():
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_exit)
        except (ValueError, AttributeError):
            pass

def _handle_exit(signum, frame):
    print("\n[dev] Shutting down...")
    if _handle_exit.backend_proc is not None:
        try: _handle_exit.backend_proc.terminate()
        except Exception: pass
    if _handle_exit.frontend_proc is not None:
        try: _handle_exit.frontend_proc.terminate()
        except Exception: pass
    sys.exit(0)
_handle_exit.backend_proc = None
_handle_exit.frontend_proc = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    _setup_signals()

    env = dict(os.environ)
    env["CONY_AUTO_CONNECT"] = env.get("CONY_AUTO_CONNECT", "true")
    env["PORT"] = str(args.port)
    env["CONY_PORT"] = str(args.port)
    env["CONY_HOST"] = args.host

    frontend_env = dict(env)
    frontend_env["VITE_COTRADE_URL"] = f"http://localhost:{args.port}"

    backend_cmd = [sys.executable, "run.py"]
    frontend_cmd = ["npm", "run", "dev"]

    print(f"[dev] Starting backend on http://{args.host}:{args.port} ...")
    _handle_exit.backend_proc = subprocess.Popen(
        backend_cmd, cwd=_root, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )

    print(f"[dev] Starting frontend (Vite) on http://localhost:5173 ...")
    _handle_exit.frontend_proc = subprocess.Popen(
        frontend_cmd, cwd=_frontend_dir, env=frontend_env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, shell=(os.name == "nt"),
    )

    # Stream output with prefixes so both are visible.
    import threading

    def _stream(proc, prefix):
        if proc is None or proc.stdout is None:
            return
        for line in iter(proc.stdout.readline, ""):
            print(f"[{prefix}] {line}", end="")
        proc.stdout.close()

    threading.Thread(target=_stream, args=(_handle_exit.backend_proc, "backend"), daemon=True).start()
    threading.Thread(target=_stream, args=(_handle_exit.frontend_proc, "frontend"), daemon=True).start()

    # Wait for either to exit, then shut down both.
    while True:
        backend_dead = _handle_exit.backend_proc.poll() is not None
        frontend_dead = _handle_exit.frontend_proc.poll() is not None
        if backend_dead or frontend_dead:
            if backend_dead:
                print(f"[dev] Backend exited with code {_handle_exit.backend_proc.returncode}")
            if frontend_dead:
                print(f"[dev] Frontend exited with code {_handle_exit.frontend_proc.returncode}")
            break
        time.sleep(0.5)

    _handle_exit(0, 0)


if __name__ == "__main__":
    main()