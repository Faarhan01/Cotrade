# The tools, and the traps that have cost backtests

The toolset is `C:\Users\faarh\Workspaces\Tools\metatrader_tools`. Use
it. It exists because every way of driving the MT5 tester by hand has a
trap, and the traps are **silent** — they do not error, they produce a
report that looks completely normal and means nothing.

## The commands

```bash
cd C:\Users\faarh\Workspaces\Tools\metatrader_tools

node mt5.mjs check                 # static checks, no compiler, instant
node mt5.mjs compile               # MetaEditor: the authoritative check
node mt5.mjs backtest --config "..\..\Custom-apps\ea\auto\symbols\Step Index\config.json"
node mt5.mjs symbols --dir ..\..\Custom-apps\ea\auto\symbols
node mt5.mjs testsymbols           # what has downloadable history here
node mt5.mjs logs --follow
```

The backtest takes `--from`/`--to` (or a config file that has them),
`--model` (0 every tick, 1 one-minute OHLC, 2 open prices only),
`--set NAME=VALUE` (repeatable) and `--no-visual`.

**Visual mode is the default**: the Strategy Tester pane opens and the
run animates. It changes nothing about the numbers, and it is **20–30×
slower** — the same 518,351 ticks take 6–10 s headless and 2–3 minutes
visually. Use `--no-visual` for anything that is not being watched.

## The traps

### 1. The config must be UTF-16LE with a BOM

A UTF-8 `.ini` is accepted by `terminal64` and then **ignored**: the
`[Tester]` block never applies, no report is produced, and the terminal
exits with no diagnostic. The file looks completely correct. The tool
writes UTF-16; never write the `.ini` by hand.

### 2. The tester MERGES the inputs with the last run's

`MQL5\Profiles\Tester\<EA>.set` is merged **over** the `.ini`'s
`[TesterInputs]`. It does not replace it. A run that names only the
values it cares about inherits the rest — and the inheritance is silent.
This has cost twice: a run meant to use `InpTakePips=30` came back with
1.2, and a persisted `InpOnlyPattern=doji` made every run measure one
detector out of thirty.

⇒ The tool names **every** input, read from the EA's source, and
**deletes** the persisted set before the run. Both are needed.

⇒ Every **enum** must be written as an **integer**. `terminal64` accepts
an unparsable input line and leaves that input at 0 without saying so —
and for most enums the default *is* 0, so the failure is invisible.

### 3. The date keys are `FromDate` and `ToDate`

There is no `StartDate`/`EndDate`. The wrong key is not an error: MT5
applies no default and tests the **entire** available history, which
looks exactly like a hang.

### 4. The report lands in the terminal's data folder ROOT

Whatever path the `.ini` names. An absolute path produces **no report at
all**. And MT5 writes the PNGs (the equity curve, the drawdown chart)
**first** and the HTML report after, so a tool that accepts any file
picks up a PNG and reports no statistics.

### 5. A running terminal swallows `/config:`

Windows routes the command line to the existing process, and MT5 then
ignores `/config:` entirely. Nothing errors. The tool refuses to start
while a terminal is up.

### 6. The model mapping

| code | model |
|---|---|
| 0 | every tick |
| 1 | 1-minute OHLC |
| 2 | open prices only |
| 3 | every tick based on real ticks |
| 4 | every tick based on real ticks, delayed |

**Model 3 does not work here.** The tester agent is given no tick
history and falls back to `math calculations test mode means no history
and no symbol info`: no bars, no indicators, zero ticks, and a run that
*looks* like it worked. Reproduced for two different symbols, so it is
the model and not the symbol. Use 0 or 1.

⇒⇒⇒ **Model 1 is what every measurement in this project was made with.**
⇒⇒⇒ (An earlier mapping in the Python runner pointed "real ticks" at 1,
⇒⇒⇒ which is the 1-minute model. Every number reported before the fix
⇒⇒⇒ was from Model 1, not from the broker's ticks.)

### 7. The leverage

MT5 has **no universal default**: the tester takes the leverage from the
**account's** specifications, which the broker sets per account. The
`Leverage=` line is therefore **omitted** unless one is asked for, so the
run is measured at the leverage the account actually has.

Forcing one measures a different account. At 1:100 the margin ran out
mid-run and MT5 started refusing trades (`not enough money`), so the
result was **truncated by the margin**, not by the strategy.

### 8. In visual mode the EA's output is in the AGENT's log

`Tester\logs\YYYYMMDD.log` holds almost nothing in visual mode; the
EA's own output is under
`%APPDATA%\MetaQuotes\Tester\<hash>\Agent-<addr>-<port>\logs\`. A tool
that only reads the tester log sees an empty run.

⇒⇒⇒ **And the tester announces a run in two forms:**

```
testing of Experts\X.ex5 from A to B started      (headless)
visual testing of Experts\X.ex5 from A to B        (visual)
```

⇒⇒⇒ The visual form has no "started" at the end. A pattern that requires
⇒⇒⇒ it finds nothing in visual mode and reports "THE TEST NEVER
⇒⇒⇒ STARTED" for a test that ran to completion.

## The compile

```bash
python "C:\Users\faarh\Workspaces\doc-files\mt5\editor\compile\compile_ea.py" "<the .mq5>"
```

MetaEditor's exit code is meaningless; the log is the truth. **0 errors
and 0 warnings** is the bar.

⇒⇒⇒ A function defined twice is error 165, "function already defined and
⇒⇒⇒ has body" — and it happens when a patch script is run twice and its
⇒⇒⇒ idempotency check is wrong (the "old" text it looks for is a
⇒⇒⇒ **prefix** of the "new" text, so the check never fires). Write file
⇒⇒⇒ edits in Python, and make the check look for the NEW text first.

## Reading the logs

The tester's log is **UTF-16** and grows to hundreds of megabytes. Read
it by **byte offset**, not by line count, and never read it whole.

Two columns look like timestamps: the wall clock (when the line was
written) and the **simulated** time (where the test got to). Only the
second one is the market's.

The date and the time are separate words: `from 2026.07.23 00:00 to
2026.10.21 00:00`. A pattern that grabs `(\S+) to (\S+)` picks up the
date and then the time.
