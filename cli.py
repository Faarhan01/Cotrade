"""Root shim for the unified Cotrade CLI.

Delegates to ``run.py`` so there is one source of truth for all
sub‑commands (server, db, bot, routes, dev).

Usage:
    python cli.py       # delegates to run.py main()
    python run.py       # same — the primary entry point
"""

import sys

from run import main


if __name__ == "__main__":
    sys.exit(main())