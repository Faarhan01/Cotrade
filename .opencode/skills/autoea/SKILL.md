---
name: AutoEA
description: Work on the AutoEA Expert Advisor - a self-calibrating MT5 EA that profiles a symbol, measures every detector's edge over several horizons and market states, and trades what is currently working. Use when changing the EA, running a backtest, reading a run's numbers, adding a detector, or adding a symbol.
---

# AutoEA

A self-calibrating Expert Advisor for MetaTrader 5. It profiles the
symbol it is on, measures **every** detector's edge over several horizons
and several market states, and trades the one that is working right now.

**The one thing to understand before touching anything:** the EA does not
know what works. It *measures* what works, on this symbol, in this window,
in this state — and it trades the measurement. So the number that matters
is never "the profit"; it is **the difference against the shadow
control**.

## The shadow control

The shadow control takes **the same entries with a coin flip for the
side**. So:

| | what it answers |
|---|---|
| the strategy's net ticks | how the market moved |
| the shadow's net ticks | how the market would have moved with a random side |
| **the difference** | **what the detector is actually worth** |

A strategy that beats the shadow is worth trading. A strategy that only
looks good is not, and MT5's own report cannot tell the two apart. Every
claim about this EA is a claim about the difference.

## The rules

1. **No fake data, no simulated results, no optimistic conclusions.** A
   run that did not happen is not a run. A number from a short window is
   not a number from a long one.
2. **No gates that filter entries without a reason.** Every gate says
   which one it was, and the EA's own output names it.
3. **The measurement decides, not a hand.** A per-symbol configuration is
   *generated from* the measurement. A configuration picked by hand per
   symbol is a curve fit, and the self-calibrating design is gone.
4. **Never quote a result without its window, its model and its
   leverage.** They decide what it means.
5. **Test the change that could have broken the previous result.** A new
   detector set must not make the known-good result worse.

## The layout

```
ea/auto/
  AutoEA.mq5              the EA: the events, the trade path, the report
  custom/
    Patterns/             the detectors: the registry is the table
    Measurement/          the profile: horizons, states, significance
    Decision/             the selection: which detector trades now
    Execution/            orders, trailing, breakeven, attribution
    Reporting/            the CSVs, the summary, the report
  symbols/                one folder per symbol: config, profile, runs
  archive/                every good build, with what it made
  CHANGES.md              every change, and what it produced
```

The **registry** (`custom/Patterns/registry.mqh`) is one line per
detector: its name, its kind and its direction. Adding a detector is one
line there. A detector's *direction* is the important part:

- `0` — the lookback's move decides (the pattern continues)
- `+1` / `-1` — always long / always short

**A detector with direction `0` can only ever be a continuation signal.**
That is why every pattern has a twin (`<pattern>_rev`): the same signal,
measured and traded in the opposite direction. A pattern that reverses
on one instrument and continues on another is the normal case, not the
exception — Step Index's inside bar continues (+11.10 ticks a hit) and
Step Index 200's *reverses* (−12.35 ticks a hit, z −2.09). Without the
twin the EA throws the second one away.

## How to work on it

**Read `references/measurement.md`** before you interpret any number:
what the horizons and the states mean, what the z-score and the edge
mean, and why "net of cost" is the number that decides.

**Read `references/tooling.md`** before you run anything: the commands,
and the traps that have each cost a whole backtest.

**Read `references/symbols.md`** before you add a symbol.

### The loop

```bash
# 1. change the EA
python compile_ea.py "C:\...\ea\auto\AutoEA.mq5"     # 0 errors, 0 warnings
python "...\ea\auto\tools\install.py"                  # into MQL5\Experts

# 2. run it
node mt5.mjs backtest --config "ea\auto\symbols\Step Index\config.json"

# 3. read the result -- the numbers, the shadow, and which detector won
node mt5.mjs symbols --dir ea\auto\symbols
```

The tool is `C:\Users\faarh\Workspaces\Tools\metatrader_tools`. Use it,
not a hand-written `.ini`: it emits every input (so a run cannot inherit
a stale one), writes the config as UTF-16 (a UTF-8 config is silently
ignored by the terminal), and files the run into the symbol's folder.

### After a change

1. **Re-run the known-good symbol.** It must not get worse. The headline
   is Step Index, `inside_bar` only, M15, 2026.07.23 → 2026.10.21:
   **+1,713.00, PF 1.42, 3,292 trades, +9,432 ticks against the shadow's
   −9,708 — a difference of +19,140 ticks.**
2. **Then try the symbol the change was for.** Step Index 200 is the
   standing test case: it refuses to trade without the twins.
3. **Write the changelog entry** in `CHANGES.md` — what changed, why, and
   what it produced.
4. **Archive the build** if it is better: `archive/AutoEA_<date>_v<version>/`,
   with the EA, the library, MT5's report and the EA's own output.
5. **Update `symbols/`** so the folder holds the new result.

## What not to do

- Do not remove a gate because it "reduced the profit" without showing
  what the gate was protecting.
- Do not quote the profit factor without the trade count. PF 1.42 over
  3,292 trades and PF 1.42 over 17 trades are different statements.
- Do not compare a run with a different window, model or leverage against
  one with different settings and call it a regression.
- Do not read `report.txt` from the terminal's `Common\Files` folder and
  assume it is this run's: it is overwritten by the next run. The tool
  files each run into `symbols/<symbol>/runs/`.
