"""
MCP Prompts
===========

Prompt templates an agent can render to get a consistent starting point.
They exist because the gateway's raw tools are numerous; a prompt encodes the
*workflow* — scan first, then backtest, then size, then trade — so an agent
does not have to rediscover the order.

Each entry is `{name, description, arguments, render}`, where `render` takes
the supplied arguments and returns the message text.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List


def build_prompts() -> Dict[str, Dict[str, Any]]:
    prompts: Dict[str, Dict[str, Any]] = {}

    def add(name: str, description: str, arguments: List[Dict[str, Any]],
            render: Callable[[Dict[str, Any]], str]) -> None:
        prompts[name] = {
            "name": name,
            "description": description,
            "arguments": arguments,
            "render": render,
        }

    add("market_overview",
        "Summarise the account and open risk.",
        [],
        lambda _a: (
            "Read cotrade://portfolio. Summarise balance, equity, floating P/L, "
            "and any position whose profit is outside +/- 20 of the account's "
            "average position size. Flag positions whose stop is further from "
            "entry than 3x the median stop distance."
        ))

    add("research_symbol",
        "Run a disciplined research pass on one instrument before trading it.",
        [{"name": "symbol", "description": "Exact MT5 symbol name.", "required": True},
         {"name": "timeframe", "description": "Bar timeframe.", "required": False}],
        lambda a: (
            f"Research {_require(a, 'symbol')} on {_opt(a, 'timeframe', 'M1')} using Cotrade.\n"
            "1. Call scan_patterns to find which chart patterns actually show follow-through.\n"
            "2. Call list_knowledgebase to see the available entry rules.\n"
            "3. Call sweep over the library templates for that symbol and timeframe.\n"
            "4. Report only strategies whose verdict beats 'noise', with the t-statistic\n"
            "   and the train/test consistency for each.\n"
            "Do not recommend a strategy on profit alone; a drifting sample looks good."
        ))

    add("risk_position",
        "Size and place a position with an explicit risk figure.",
        [{"name": "symbol", "description": "Exact MT5 symbol name.", "required": True},
         {"name": "risk_amount", "description": "Amount to risk in account currency.", "required": True},
         {"name": "stop_pips", "description": "Stop distance in pips.", "required": True},
         {"name": "direction", "description": "buy or sell.", "required": True}],
        lambda a: (
            f"Size and place a {_opt(a, 'direction', 'buy')} on {_require(a, 'symbol')} "
            f"risking {_opt(a, 'risk_amount', '?')} with a {_opt(a, 'stop_pips', '?')} pip stop.\n"
            "1. Call get_account to confirm the balance and margin free.\n"
            "2. Call calc_size with the risk amount and stop distance to get the lot size.\n"
            "3. Call check_order with that size to confirm the terminal would accept it.\n"
            "4. Only then call buy or sell. Report the ticket and the retcode.\n"
            "If any step errors, stop and report the error rather than retrying blindly."
        ))

    add("close_exposure",
        "Flatten or reduce exposure deliberately.",
        [{"name": "symbol", "description": "Limit to one symbol; omit to close everything.", "required": False}],
        lambda a: (
            "Inspect current exposure, then flatten it.\n"
            "1. Call get_positions and list every ticket with its live P/L.\n"
            "2. Call get_account so the balance before and after can be reported.\n"
            + ("3. Call close_position for each ticket on this symbol only.\n"
               f"   Symbol: {_opt(a, 'symbol', '(all)')}\n"
               if _opt(a, "symbol", "") else
               "3. Call close_all.\n")
            + "4. Re-read get_positions to confirm the book is flat.\n"
            "Report positions actually closed, and any that failed."
        ))

    add("audit_risk",
        "Check the whole book for risk concentration and missing protection.",
        [],
        lambda _a: (
            "Audit the open book for risk, using cotrade://portfolio.\n"
            "Report: total floating P/L; positions with no stop loss; positions with no\n"
            "take profit; the largest single-symbol exposure as a share of equity; and any\n"
            "symbol carrying more than 3 open positions.\n"
            "Be explicit about what you could not determine."
        ))

    add("session_report",
        "Summarise what happened over a trading window.",
        [{"name": "days", "description": "Window in days.", "required": False}],
        lambda a: (
            f"Produce a trading report for the last {_opt(a, 'days', '7')} days.\n"
            "1. Call get_history_summary for realised profit, commission, swap and net.\n"
            "2. Call get_history_deals and group by symbol and side.\n"
            "3. Report: net result, best and worst symbol, buy vs sell contribution,\n"
            "   and whether commission or swap materially changed the outcome.\n"
            "Use the net figure the server returns; do not recompute it differently."
        ))

    return prompts


def _require(args: Dict[str, Any], name: str) -> str:
    value = args.get(name)
    if not value:
        raise ValueError(f"'{name}' is required")
    return str(value)


def _opt(args: Dict[str, Any], name: str, default: str = "") -> str:
    value = args.get(name)
    return str(value) if value not in (None, "") else default