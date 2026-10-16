#!/usr/bin/env python3
"""
Cotrade Application Entry Point for AI Studio
==============================================
Runs the Cotrade gateway daemon and dashboard web server on host 0.0.0.0:3000.
"""

import os
import sys

_root = os.path.dirname(os.path.abspath(__file__))
_backend = os.path.join(_root, "backend")
_db = os.path.join(_backend, "db")
_gateway = os.path.join(_backend, "gateway")

for _d in (_root, _backend, _db, _gateway):
    if _d not in sys.path:
        sys.path.insert(0, _d)

# AI Studio dev server runs on port 3000. Note: Do not fall back to PORT (8080)
# because 8080 is used by container ingress.
port = int(os.environ.get("CONY_PORT", "3000"))
host = os.environ.get("CONY_HOST", "0.0.0.0")

os.environ["CONY_PORT"] = str(port)
os.environ["CONY_HOST"] = host

from deamon.__main__ import main as daemon_main

if __name__ == "__main__":
    sys.exit(daemon_main())
