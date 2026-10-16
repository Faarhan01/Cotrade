"""
database — SQLite persistence
==============================
Stores strategies, indicator and pattern reference data, backtest reports and
pattern scan results.

    from database import Store
    store = Store()            # backend/database/data/peron.db by default
    store.migrate()
    store.save_strategy(plan)

Pure stdlib `sqlite3`; adds no dependency beyond what the project already has.
"""

from database.schema import REPORT_FIELDS, SCHEMA, STRATEGY_FIELDS
from database.store import DEFAULT_PATH, Store, new_run_id

__all__ = ["Store", "new_run_id", "DEFAULT_PATH", "SCHEMA",
           "REPORT_FIELDS", "STRATEGY_FIELDS"]
