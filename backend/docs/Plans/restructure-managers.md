# Refactor Plan — `managers/` restructure and `cony` → `mt5pkg_bridge`

> Goal: move the MT5 package bridge out of `managers/`, consolidate the three
> HTTP-serving packages under `gateway/`, and rename `cony` to `mt5pkg_bridge`.
> **Analysis only — nothing has been changed yet.**

---

## 1. What the layout actually is today

```
backend/
├── core/                     HTTP layer: config, server, routes, validation, mcp
│   ├── config.py             imports managers.mt5_manager.cony   <-- upward dep
│   ├── server/               imports managers.mt5_manager.cony <-- upward dep
│   ├── bot_runtime.py        (new)
│   └── mcp/
├── managers/
│   ├── api_manager/          Research — knowledgebase research service
│   ├── front_manager/        static/SPA serving
│   ├── mt5_manager/
│   │   └── cony/             <-- the MT5 package bridge lives here
│   │       ├── api_manager.py    MT5 function auto-discovery
│   │       ├── connection.py     initialize/login/shutdown
│   │       ├── enums.py          28 enum maps
│   │       ├── marketbook.py     depth of market
│   │       ├── mt5_engine.py     35 methods over 32 package callables
│   │       ├── paths.py          package discovery
│   │       ├── serializers.py    namedtuple -> dict
│   │       └── __init__.py
│   ├── routes_manager/       research, bot, db route registration
│   └── services_manager/      backtest, scan, sizing, validation services
├── gateway/
│   ├── cli/                  serve, db, routes, sweep, scan, list, report
│   ├── cony/                 *** STALE: .pyc files only ***
│   ├── deamon/               config.py, logger.py, __main__.py
│   ├── tools/                verify.py, audit_*.py, scalp_lab.py, ...
│   └── docs/
├── database/  knowledgebase/  services/  tools/
```

### Two findings that change the plan

**A. `backend/gateway/cony/` is a live hazard, not just clutter.**
It contains only `.pyc` files — leftovers from an earlier move, untracked by git
(0 tracked files). I proved the danger experimentally: a directory with no
`__init__.py`, listed *earlier* on `sys.path`, wins as an implicit namespace
package and silently shadows the real package.

```
resolved: <no VALUE> | file: None
```

`backend/gateway` **is** on the daemon's `sys.path`, so
`backend/gateway/cony/` is one `sys.path` reorder away from shadowing the real
bridge. It currently survives only because the real package is found later on
the path — an accident of ordering, not a guarantee. **This should be deleted
regardless of what else is decided.**

**B. The "two `api_manager`s" are unrelated — don't merge them.**
- `managers/api_manager/` → `Research`, the knowledgebase research service
- `managers/mt5_manager/cony/api_manager.py` → MT5 function auto-discovery

Same directory name, zero shared responsibility. Moving the second one into
`cony/` as you described is fine; merging them would be wrong.

---

## 2. Target layout

```
backend/
├── core/                     unchanged (HTTP, config, server, mcp)
│   └── config.py, server/    import mt5pkg_bridge  (was managers.mt5_manager.cony)
├── gateway/
│   ├── mt5pkg_bridge/        <-- moved from managers/mt5_manager/cony/, renamed
│   │   ├── __init__.py
│   │   ├── api_manager.py    (was cony/api_manager.py)
│   │   ├── connection.py
│   │   ├── enums.py
│   │   ├── marketbook.py
│   │   ├── mt5_engine.py
│   │   ├── paths.py
│   │   └── serializers.py
│   ├── server/               <-- moved from gateway/deamon/  (HTTP server)
│   ├── cli/                  unchanged (imports core.server)
│   ├── research/             <-- moved from managers/api_manager/
│   ├── bot/                  <-- moved from managers/routes_manager/bot_routes.py + db_routes.py
│   ├── database/             <-- moved from managers/routes_manager/db_routes.py
│   ├── front/                <-- moved from managers/front_manager/
│   ├── services/             <-- moved from managers/services_manager/
│   ├── tools/                unchanged (dev/verify tooling)
│   └── docs/
├── database/  knowledgebase/  services/  tools/
```

`managers/` disappears. Everything that serves HTTP or drives MT5 lives under
`gateway/`.

### Why this grouping

| Group | Responsibility | Depends on |
|---|---|---|
| `mt5pkg_bridge` | Talks to the MT5 package. No HTTP, no routing, no DB. | package only |
| `server` | Sockets, SSE, process lifecycle | bridge, core |
| `research` | Knowledgebase-driven analysis | bridge, knowledgebase, DB |
| `bot` / `database` | Session + DB HTTP routes | bridge, DB |
| `front` | Static/SPA serving | nothing |
| `services` | Application services over research | research |
| `cli` | Terminal entry points | server, research |

The dependency arrows only point one way: `cli -> server -> bridge -> package`.
`mt5pkg_bridge` stays HTTP-free, so it remains usable from scripts and tests
exactly as the current `cony` docstring advertises.

### On the name `mt5pkg_bridge`

Good choice — it says what it is (bridges the **MT5 package**) rather than
repeating the project name. Two notes:

- `cony` currently means "the whole gateway" in prose and log messages
  (`cony-gateway/1.0`, `logger = logging.getLogger("cony.server")`). After the
  rename those should read `gateway` / `cotrade`, otherwise the name `cony`
  lingers in logs with two meanings.
- `logger` names are not imports, so they are safe to change but easy to miss.
  A grep for `cony` in the final pass should return **only** historical docs.

---

## 3. Difficulty assessment

**Medium. Roughly 1–2 days of careful work, and mechanical in nature.**

The move itself is `git mv`. The risk is entirely in the import graph and
`sys.path`, which this codebase sets up by hand in **seven** separate places.

### Measured blast radius

| Category | Count | Notes |
|---|---|---|
| Files with `cony` in *code* (imports) | 8 | real work |
| Files with `cony` in *prose/log names* | ~25 | find-and-replace |
| Doc files mentioning `cony` | 12 | mostly historical; leave or annotate |
| Modules that must still import | 29 | baseline verified |
| `sys.path` blocks to update | 7 | the real risk |
| Tests available | 0 runnable | pytest not installed |

The 8 code sites:

```
core/config.py                     from managers.mt5_manager import cony
core/server/handlers.py            from managers.mt5_manager import cony
core/server/validation.py          from managers.mt5_manager import cony
gateway/deamon/__main__.py         from managers.mt5_manager import cony
gateway/deamon/config.py           from managers.mt5_manager import cony
core/mcp/tools.py                  from cony import enums  (x3)
gateway/tools/audit_coverage.py    from cony import ConnectionManager, MT5Engine
gateway/tools/introspect_package.py from cony.paths import find_mt5_package
```

Plus internal: `cony/api_manager.py` (2 self-referential imports),
`cony/__init__.py` (1), `mt5_manager/__init__.py` (1).

### The `sys.path` problem

Every entry point hand-builds `sys.path`:

```python
_mt5_manager = os.path.join(_managers, "mt5_manager")
for _dir in (_root, _backend, _core, _gateway, _managers, _mt5_manager, ...):
    sys.path.insert(0, _dir)
```

After the move, `gateway/` is already on the path, so
`from mt5pkg_bridge import MT5Engine` works with **no new entry needed** — but
`mt5_manager` must be dropped everywhere or it becomes another shadowing
hazard. Present in `run.py`, `gateway/deamon/__main__.py`, `app.py`,
`cli.py`, `dev.py`, and the `gateway/tools/*.py` scripts.

**Recommendation:** replace the hand-rolled path juggling with a single
`backend/paths.py` (or a `conftest.py` + `pip install -e .`) so there is one
place to fix. That is the durable fix; without it, every future move repeats
this risk. This is optional but strongly advised — it is what allowed finding A
to become a hazard in the first place.

### Effort breakdown

| Phase | Work | Time | Risk |
|---|---|---|---|
| 0 | Delete stale `gateway/cony/`, add pytest, get a green baseline | 1 h | none |
| 1 | Move `cony` -> `gateway/mt5pkg_bridge`, update 8 imports | 1–2 h | low |
| 2 | Centralise `sys.path` | 2–3 h | medium |
| 3 | Move `deamon` -> `server`, update imports | 1 h | low |
| 4 | Move `api_manager`/`routes_manager`/`front_manager`/`services_manager` | 2–3 h | low |
| 5 | Rename loggers/docs, delete `managers/` | 1 h | low |
| 6 | Verify: imports, CLI, daemon, MCP, REST, tests | 2 h | — |

---

## 4. Verification strategy

The move is only proven by re-running the baseline. Established:

```
BASELINE (daemon path order) import failures: 0
```
across 29 modules including every package that moves.

Checks to repeat after each phase:

```powershell
# 1. structural
git status --porcelain          # expect R (renames), not D+A pairs
python -c "import backend.gateway.mt5pkg_bridge"   # after phase 1

# 2. import graph (the real gate)
cd backend; python -c "<29-module import check, daemon path order>"

# 3. behaviour
python run.py routes             # expect 46 MCP tools, 16 bot routes
python cli.py routes             # CLI parity
python run.py db                 # DB integrity

# 4. runtime
python run.py                    # boot, check MCP + REST + bot smoke
pytest                           # once installed
```

**Gates:** no phase proceeds until the import check returns 0 failures and
`run.py routes` is unchanged. If a phase needs a temporary shim, it is
reverted rather than left behind — shims are how the current duplicate-`cony`
problem started.

---

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stale `.pyc` shadowing after the move | **High** | Delete all `__pycache__` between phases; `git status` must show renames |
| A forgotten `sys.path` entry | High | Centralise into one module (Phase 2) |
| Two packages named `api_manager` confused | Medium | Rename the MT5 one to `discovery.py` — it discovers functions, not routes |
| `cony` surviving in log names | Low | Grep sweep at the end; rename `cony-gateway` -> `cotrade-gateway` |
| Docs describing the old layout | Low | `docs/restructure.md` already anticipates this; update `context.md` |
| No test coverage during the move | Medium | Install pytest first; the suite exists, it just isn't installed |
| `gateway/tools/*.py` scripts break | Low | They self-bootstrap `sys.path`; update all 5 |

---

## 6. Suggested phasing

Do **not** attempt the whole move in one commit. Four reviewable steps:

1. **Cleanup + baseline** — delete `gateway/cony/`, install pytest, record the
   baseline. *Zero risk, and independently valuable.*
2. **Bridge move + rename** — `cony` -> `gateway/mt5pkg_bridge`. This is the
   change that matters most: it puts the MT5 package boundary at the top level
   instead of nested under `managers/`.
3. **sys.path consolidation** — one module owns path setup. Eliminates the
   class of bug found in finding A.
4. **Package consolidation** — `deamon` -> `server`, `managers/*` -> `gateway/*`.

Steps 1–2 deliver most of the value (the structural problem is fixed) at low
risk. Steps 3–4 are cleanup that can follow later.

---

## 7. Open questions for you

1. **Keep the name `cony`?** Renaming to `mt5pkg_bridge` is clearer, but
   `cony` appears in ~25 files as prose and in log names. Rename now while
   files are open, or keep `cony` and only relocate it?
2. **Do you want the `sys.path` consolidation?** It is the real fix for the
   hazard class, but it is a behaviour change to every entry point.
3. **Keep `deamon` (the existing typo for "daemon") or correct it** during the
   move to `server`?
4. **Docs:** `docs/restructure.md` (35 `cony` mentions) is a historical plan —
   archive it, or update it to describe the target layout?