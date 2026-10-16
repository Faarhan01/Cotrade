#! /usr/bin/env python3
"""
Cotrade Application Entry Point for AI Studio

Runs the Cotrade gateway daemon and dashboard web server on host 0.0.0.0:3000.

Delegates to ``run.py`` so there is one source of truth for the daemon start-up.
"""

import sys

from run import main

if __name__ == "__main__":
    sys.exit(main())