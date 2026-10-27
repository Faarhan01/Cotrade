# Adding a symbol, and keeping the record straight

Each symbol we trade has a folder. The folder holds everything needed to
reproduce its result, and every run is filed in it.

```
ea/auto/symbols/
  README.md
  INDEX.md                 one line per symbol: what it made
  Step Index/
    config.json            the configuration that produced the result
    profile.md             what we LEARNED about this symbol
    runs/
      2026-10-22_v2.05/
        result.json        the numbers, machine-readable
        report.htm         MT5's own report
        summary.txt        the EA's own summary
        patterns.csv       every detector's measurement
        trades.csv         the totals and the shadow
        decisions.csv      every re-decision
```

## Adding a symbol

**1. Does it have history?**

```bash
node mt5.mjs testsymbols
```

The tester needs the history in `bases\<server>\history\<symbol>`. A
symbol with no history produces no bars and no profile, and the run
looks like it worked.

**2. Write the folder.**

```bash
mkdir "ea\auto\symbols\<symbol>\runs"
```

`config.json`:

```json
{
  "symbol": "Step Index 200",
  "period": "M15",
  "model": 1,
  "from": "2026.07.23",
  "to": "2026.10.21",
  "inputs": {
    "InpOnlyPattern": "inside_bar",
    "InpUseAccumulated": "false",
    "InpProfileRefreshMinutes": "0",
    "InpMaxPositions": "0",
    "InpTrailMode": "3",
    "InpTrailDistance": "3",
    "InpMoveToBreakeven": "true",
    "InpBreakevenAt": "1.0"
  },
  "note": "what is special about this symbol"
}
```

**3. Run it.** The run files itself:

```bash
node mt5.mjs backtest --config "ea\auto\symbols\<symbol>\config.json"
```

⇒ The numbers, MT5's report and the EA's own output land in
`runs/<date>_v<version>/`.

**4. Write `profile.md`.** It is written from the EA's own output — the
symbol's costs, what was measured, every detector with its edge and
**which way it works**, what was traded, and the difference against the
shadow. Nothing in it is typed in by hand.

**5. Update `symbols/INDEX.md`.**

## The rule about configurations

**A configuration is generated from the measurement, never picked by
hand.** The EA measures; if each symbol's configuration is chosen by
somebody who looked at the profit curve, the self-calibrating design is
gone and the results are curve fits.

So:

- the **config** holds the mechanics — the timeframe, the trailing stop,
  the scope of the measurement, the date range;
- the **profile** holds what was measured;
- when the measurement changes, the config follows it.

⇒⇒⇒ The one exception worth making is the **scope**: naming a detector
⇒⇒⇒ in `InpOnlyPattern` to isolate it while you study it. That is a
⇒⇒⇒ measurement decision, and it is recorded in the config, so the run
⇒⇒⇒ can be reproduced.

⇒⇒⇒ Naming a pattern also allows its twin, because they are the same
⇒⇒⇒ signal the other way round.

## The difference between a symbol that works and one that does not

A symbol can be unprofitable for three quite different reasons, and the
EA's own output says which:

| the output says | what it means |
|---|---|
| "no feature has an edge" | nothing measured well enough to trade — **correct behaviour** |
| "… has an edge of 56.00 ticks but only 3 hits, and 30 are needed" | an edge, but not enough evidence — **correct behaviour** |
| "the strategy 5,311 trades, −12,400 ticks, the shadow −21,772" | it traded and beat the shadow by 9,372 ticks but still lost: the detector is real and the costs are too high for it |

⇒⇒⇒ **The third case is the interesting one.** A negative difference
⇒⇒⇒ means the pattern did not beat chance, and the run says so.

⇒⇒⇒ A symbol that refuses to trade is not a failure. It is the EA
⇒⇒⇒ saying it does not know anything it is willing to bet on — which,
⇒⇒⇒ on a self-calibrating EA, is the correct outcome most of the time.
