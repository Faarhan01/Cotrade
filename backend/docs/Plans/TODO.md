# TODO

## Fixed in this pass

| | Problem | Evidence |
|---|---|---|
| ✅ | **Strategy updates silently lost.** `store.py` UPDATE branch had no `commit()`. | Fixed in prior pass. |
| ✅ | **Trailing stop loosened instead of ratcheting.** `engine.py` re-derived the stop from each bar's own high/low. | Fixed in prior pass. |
| ✅ | **Validator accepted a negative take-profit.** | Fixed in prior pass. |
| ✅ | **Look-ahead bias in `rsi_reversion(confirm=N)`.** | Fixed in prior pass. |
| ✅ | **Hardcoded gateway port broke the research layer.** | Fixed in prior pass. |
| ✅ | **No regression test for any of the above.** | Fixed in prior pass. |
| ✅ | **The site had no price chart.** | Fixed in prior pass. |
| ✅ | **Chart timestamps rendered in UTC.** | Fixed in prior pass. |
| ✅ | **`validation_service.py` called non-existent `kstrategies.validate_strategy()`.** | Injected `Research` instance instead. |
| ✅ | **`live.py` `evaluate()` referenced undefined `signal`.** | Now calls `self.current_signal(bars)`. |
| ✅ | **`cli/app.py` imported `from run import cmd_db` — ModuleNotFoundError.** | Fixed import path. |
| ✅ | **`lifecycle_test.py` + `scalp_lab.py` used `d["digits"]` where `d = sym["_derived"]`.** | Now uses `sym["digits"]`. |
| ✅ | **`audit_hardcode.py` referenced `deamon/config.py` (typo).** | Fixed to `core/config.py`. |
| ✅ | **`audit_layering.py` `entry_ok` used before assignment.** | Initialized per-file. |
| ✅ | **`introspect_package.py` hardcoded Windows path.** | Uses `find_mt5_package()`. |
| ✅ | **`research.py` optimize_strategy set exit_rule params on entry_rule.** | Fixed to `plan.exit_rule`. |
| ✅ | **`research.py` get_report fetched only 1 report.** | Now queries by `run_id` directly. |
| ✅ | **`handlers.py` candles handler latent NameError on `start`.** | Guarded the reference. |
| ✅ | **Container services never wired in.** | `build_container` now populates all services. |
| ✅ | **`live.py` `trailstops()` was a no-op stub.** | Now actually ratchets stops. |
| ✅ | **`patterns.py` `describe()` missing 4 pattern entries.** | All patterns now described. |
| ✅ | **`api.py` indicator catalogue missing 6 indicators.** | All indicators now catalogued. |
| ✅ | **`bot_routes.py` pause/resume reset metrics to 0.** | Now preserves existing metrics. |
| ✅ | **`patternchecker.py` vestigial block + main --save bypass.** | Removed vestigial code, unified save path. |
| ✅ | **MT5 enums not fully exposed.** | Added 14 new enum maps (position_reasons, order_reasons, deal_reasons, symbol_calc_modes, etc.). |
| ✅ | **Knowledgebase too small.** | Expanded to 28 patterns, 25 indicators, 11 entry rules, 13 strategy templates. |
| ✅ | **No walk-forward analysis.** | Added `walk_forward()` and `parameter_sensitivity()` to engine. |
| ✅ | **Frontend utils.js duplicate keys + ambiguous endpoints.** | Fixed all duplicates, disambiguated API paths. |
| ✅ | **`runner.py` mutated shared library objects.** | Now works on a copy. |
| ✅ | **Tautological/vacuous tests.** | Fixed `test_patterns.py` and `test_indicators.py`. |

---

## Remaining known issues (lower priority)

### MAJOR

### 1. Naive local time fed to MT5
*reported, high confidence*

`mt5_engine.py:553`, `validation.py:148`, `research.py:85`, `datafeed.py:126`

Every default window is computed from naive `datetime.now()` and passed to
`copy_rates_from` / `copy_rates_range`. On a machine not running UTC, every
default-window request is silently wrong by the UTC offset.

### 2. `/history/summary` `net` omits commission
*reported*

`handlers.py:723` — `"net": round(realized + swaps, 2)`. Commission is computed
at line 711 and returned separately, but excluded from `net`.

### 3. Accepted-retcode logic implemented twice
*reported*

- `handlers.py:467` — `retcode_name(retcode) in ("Done", "Done Partial")`
- `mt5_engine.py:665` — `retcode in self._accepted_retcodes()` (numeric)

They diverge whenever `retcode_name()` cannot resolve a code.

### 4. `MarketBook` mixes resolved and unresolved symbol names
*reported*

`subscribe()` stores the broker-cased name; `get()`, `unsubscribe()` use the
raw one and pass it straight to `market_book_get()`.

### 5. `ensure_connected()` races; double `mt5.initialize()`
*reported*

`connection.py:158` — the `if not self._connected` check is outside the lock.

### 6. `connect()` clears the reconnect stop event
*reported*

`connection.py:104` — one flag serving two incompatible purposes.

### 7. `enums.load()` caches an import failure permanently
*reported*

`enums.py:24` sets `_loaded = True` **before** attempting the import.

### 8. Backtest cache returns a silently truncated bar set
*reported*

`datafeed.py:156` — `if len(local) >= min(count, 100): return local`.

### 9. `breakeven_after_pips` documented but not implemented in engine
*reported*

Declared on `ExitRule`, round-tripped through `to_dict`/`from_dict`, written
to the database, and offered to agents at `/research/catalogue`. `engine.run`
never reads it.

### 10. `Strategy.spread_pips` is always overwritten before use
*reported*

`api.py:355` and `runner.py:138` both clobber the field with the live spread.

### 11. `warmup_only` is a `bool` used as a slice count
*reported*

`api.py:185` — `values[-warmup_only:]` with `warmup_only=True` returns **one**
element.

### 12. `date_range` compares tz-aware with tz-naive datetimes
*reported*

`validation.py:148` — a `"...Z"` query yields an aware datetime while the
default `end` is naive.

### 13. `save_strategy` TOCTOU; `sync_*` not atomic
*reported*

`store.py:85` selects, releases the lock, then re-acquires at line 99.

### 14. `LiveTrader.open_positions()` sends an unquoted symbol
*reported*

`live.py:66` — three other methods in the same class do `.replace(' ', '%20')`.

---

## MINOR

### 15. Pip/point conversion implemented in five places
### 16. `momentum_entry` window boundaries disagree
### 17. `ma_cross` negative-index wraparound
### 18. Trailing-stop / time-exit reads one bar past the window
### 19. Baseline mean uses a mismatched denominator
### 20. Bonferroni threshold uses a normal quantile, not a t quantile
### 21. Sorting by |t| surfaces the biggest loser first
### 22. Hardcoded `run_id` on every API backtest
### 23. `CONY_LOG_LEVEL` and `CONY_LOG_FILE` silently do nothing
### 24. Dead code
### 25. `runner.cmd_*` leak the Store on exception

---

## Site

### 26. Depth of market is unreachable from the UI
### 27. No trading controls
### 28. Two more pages worth having
### 29. Accessibility gaps

---

## Documentation

### 30. `api-reference.md` covers 23 of 61 routes
### 31. Project name has drifted from the code

---

## Infrastructure

### 32. No CI
### 33. No requirements file
### 34. Not load-tested
### 35. The gateway has not been run against a live (non-demo) account
