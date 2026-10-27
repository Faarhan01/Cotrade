# What every number means

The EA measures; it does not guess. This is what it measures, and what
each number is allowed to be used for.

## The three levels of control

| | what it does | what it answers |
|---|---|---|
| **the detector feature** | the EA's own signal: profile the symbol, pick the detector with the largest edge in the current state, wait for it to fire, trade it | "what does this pattern do here?" |
| **the control** (`InpTradeTheControl`) | a seeded coin flip for the side, with no detector filter | "what does this instrument do if you trade it at random?" |
| **the shadow control** | the same entries, the same times, with the **side** flipped | "is the pattern's *direction* worth anything?" |

**The shadow is the honest control.** The plain control enters on nearly
every bar, so its trade count is a hundred times the strategy's and the
two are not comparable. The shadow takes the same entries with a random
side, so the comparison isolates one thing: the direction.

## The measurement

**The window.** 2,000 bars by default (`InpProfileBars`), refreshed every
200 bars (`InpProfileRefresh`). The window slides; the bars already
counted are not counted twice.

**The horizons.** How long a pattern has been working: 48 hours, 1 week,
1 month, and all-time. A detector can be good for a week and dead for a
month, and the horizons say which.

**The states.** Where it works: quiet/expanding × up/down drift. The
selection ranks by the edge **in the state the symbol is in now**, and
the trade is refused if the detector is losing in that state.

**The state of a detector**: `persistent`, `emerging`, `coming back`,
`dying`. A dying detector is not traded.

## The numbers

### The edge, and "net of cost"

The detector's **mean forward move, in the direction it trades**, minus
what the trade costs:

```
edge = mean forward move - round trip cost
```

The round trip cost is the spread paid on the way in *and* on the way
out. On Step Index the spread is 1 tick, so the round trip is 2 ticks;
on Step Index 200 it is 2 ticks, so the round trip is 4.

**The direction matters, and it is in the sign.** For a detector with
direction `0` the mean is measured in the lookback's move:

- **positive** ⇒ the pattern works *with* the move (a continuation)
- **negative** ⇒ the pattern works *against* it (a reversal)

A negative edge is not "no edge" — on an instrument where the pattern
reverses it is a strong edge in the other direction. That is what the
twins are for: `<pattern>_rev` measures the same bars in the opposite
direction, so a significant −12.35 becomes a significant +12.35.

**The direction in the report.** `patterns.csv` has one row per
detector, and the sign of `netOfCostTicks` says which way it works.
`symbols/<symbol>/profile.md` says it in words: "with the move" or
"REVERSES".

### The z-score

```
z = mean / (standard error of the mean)
```

How many standard errors from zero the average sits — the significance
test. `|z| >= 2` means the edge is very unlikely to be luck.

The z-score's **sign follows the mean**, so a significant reversal has a
negative z. Both signs pass the significance gate; only the edge decides
which side is traded.

### The consistency

The fraction of the four quarters of the window in which the detector
agreed with itself (`InpMinConsistency`, 0.75). A detector that is good
in three quarters out of four is a different claim from one that is good
in all four.

### The hits, and the sample count

A detector needs `InpMinPatternHits` (30) hits before it is considered
at all. `dark_cloud` on Step Index 200 measured **+56.00 ticks a hit
with 3 hits** — a spectacular edge on three observations, and the EA
refused it, correctly. The sample count comes first.

### The costs

The trade costs the round trip (the spread twice). The **typical move**
is the median bar-to-bar move; the **move/cost ratio** is the typical
move over the round trip, and it says how much room the strategy has. A
ratio of 10 means the typical move is ten times the cost.

## The result

| | what it is |
|---|---|
| **net ticks** | the strategy's ticks, over the closed trades |
| **shadow ticks** | the same entries with the side flipped |
| **difference** | **net ticks − shadow ticks: what the detector is worth** |
| **ticks a trade** | the difference divided by the trade count: the edge per trade |
| **net profit** | the money, from MT5's own deals |
| **profit factor** | gross profit over gross loss |
| **maximum drawdown** | the worst fall from the peak balance |

**The profit factor is not the result.** It says how the money went, not
whether the detector had an edge. A strategy can have PF 1.42 by luck
over 3,292 trades and still lose against its shadow.

⇒⇒⇒ **ALWAYS quote the difference, the trade count, the window, the
model and the leverage together.**

## Reading a run's files

| file | what is in it |
|---|---|
| `report.txt` | the run: the money, the trades, the shadow, what was measured |
| `status.txt` | the last line of the same thing: the verdict and the reason |
| `summary.txt` | the symbol, the measurement, the decision, the result |
| `patterns.csv` | **every detector**: hits, mean, z, net of cost, consistency |
| `trades.csv` | the totals: trades, wins, losses, net, the shadow, the difference |
| `decisions.csv` | one row per re-decision: the bar, the detector, the edge, the verdict |
| `profile.csv` | the profile's own numbers: the symbol's costs, the sample sizes |

The **reason** is the most useful line in the whole output: it says
exactly which gate refused the trade. "dark_cloud has an edge of 56.00
ticks but only 3 hits, and 30 are needed" is a complete answer. "no
trades" is not.
