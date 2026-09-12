# Six- and eight-seat tables cannot finish

**Status:** known, unfixed. The diagnosis below is settled and measured; the choice of
remedy is not.

## The problem

You win by bringing your score down to zero. At six seats and above, a table's scores
added together drift upward rather than downward, so games at those sizes move away from
the win condition instead of toward it.

This is a rule-design consequence, not a defect in any particular function. Nothing throws,
nothing is inconsistent, and the round reducer is correct throughout.

## Why

Three rules interact:

- A round always has exactly five tricks, whatever the seat count
  (`TRICKS_PER_ROUND` in `src/engine/config.ts`).
- Each trick won is worth minus one point.
- Playing a round and winning no trick is worth plus five (`DEFAULT_BLANK_PENALTY`).

Add up one round across the whole table. The five tricks remove five points in total, no
matter how they are shared out. Every player who wins nothing puts five back. So:

```
table total = multiplier x (blankPenalty x blanks - 5)
```

Five tricks cannot reach more than five players, so with `N` players in a round at least
`N - 5` of them must end empty-handed:

| Seats in | Blanks, at minimum | Best possible table total |
| -------- | ------------------ | ------------------------- |
| 4        | 0                  | -5                        |
| 5        | 0                  | -5                        |
| 6        | 1                  | 0                         |
| 7        | 2                  | +5                        |
| 8        | 3                  | +10                       |

**The best case is not the useful number.** Tricks concentrate: one strong hand often takes
three or four of the five, so the typical round leaves far more players empty-handed than
the minimum. Measured average blanks per round, across full simulated games:

| Seats | Blanks, at minimum | Blanks, measured average |
| ----- | ------------------ | ------------------------ |
| 4     | 0                  | 0.84                     |
| 5     | 0                  | 1.43                     |
| 6     | 1                  | 2.15                     |
| 8     | 3                  | 3.87                     |

Even at four seats nearly one player per round wins nothing. That is why the table total
only just manages to fall at the current settings, and why it stops falling so early.

Sitting out scores zero and would relieve the pressure, but it cannot be leaned on:
`MAX_CONSECUTIVE_SIT_OUTS` is two, a player below `forcedPlayThreshold` may not sit out at
all, and `sitOutBlockedReason` forbids it outright whenever clubs is trump, which is
roughly a quarter of rounds.

## Which presets are affected

| Preset       | Seats | Deck | Affected |
| ------------ | ----- | ---- | -------- |
| `normal`     | 4     | 40   | no       |
| `long`       | 4     | 40   | no       |
| `mesaGrande` | 6     | 52   | yes      |
| `party`      | 8     | 52   | yes      |
| `liga`       | 6     | 40   | yes      |

Five-seat custom tables are also affected, though less obviously.

## How to judge a fix

**Use the average per-round change in the table total. Do not use the finish rate.**

A table whose scores drift upward can still finish occasionally, because variance
sometimes carries one player to zero before the drift dominates. The lower the starting
score, the more often that happens, so measuring at a low starting score makes a broken
configuration look healthy. Six seats with a blank penalty of 3 finished every game from
20 points and not a single game from 60:

| Seats | Deck | Start | Penalty | Finished | Median rounds | Mean table delta |
| ----- | ---- | ----- | ------- | -------- | ------------- | ---------------- |
| 6     | 52   | 20    | 3       | 12/12    | 40            | +0.72            |
| 6     | 40   | 60    | 3       | 0/12     | never         | +1.53            |

Same rules, opposite verdict. The mean delta was positive in both cases and was telling the
truth both times.

## Evidence for the diagnosis

Full games played by the built-in bot policy, abandoned after 20,000 rounds, at the current
blank penalty of 5:

| Seats | Deck | Start | Finished | Median rounds | Mean table delta |
| ----- | ---- | ----- | -------- | ------------- | ---------------- |
| 4     | 40   | 20    | 12/12    | 21            | -0.80            |
| 5     | 40   | 20    | 8/12     | 47            | +2.13            |
| 6     | 52   | 20    | 1/12     | 17            | +5.76            |
| 8     | 52   | 15    | 0/12     | never         | +14.33           |
| 6     | 40   | 1000  | 0/12     | never         | +6.72            |

The measured drift matches the closed form, which is the point: this is not a bot artifact.
A better bot wins more tricks for itself but cannot create tricks the rules do not deal.

## Candidate remedy

Make the blank penalty fall as the table grows. The requirement is
`blankPenalty x averageBlanks < 5`, which given the measured averages above allows:

| Seats | Largest penalty that still converges | Proposed |
| ----- | ------------------------------------ | -------- |
| 4     | 5.95                                 | 5        |
| 5     | 3.50                                 | 3        |
| 6     | 2.33                                 | 2        |
| 7     | ~1.67                                | 1        |
| 8     | 1.29                                 | 1        |

Verified at a starting score of 60, which is high enough that variance cannot rescue a
drifting configuration:

| Seats | Deck | Penalty | Finished | Median rounds | Mean table delta |
| ----- | ---- | ------- | -------- | ------------- | ---------------- |
| 4     | 40   | 5       | 8/8      | 102           | -0.98            |
| 5     | 40   | 4       | 4/8      | 655           | +0.77            |
| 5     | 40   | 3       | 8/8      | 104           | -0.85            |
| 6     | 40   | 3       | 0/8      | never         | +1.53            |
| 6     | 40   | 2       | 8/8      | 148           | -0.98            |
| 6     | 52   | 2       | 8/8      | 104           | -1.22            |
| 7     | 52   | 2       | 8/8      | 709           | +0.33            |
| 7     | 52   | 1       | 8/8      | 82            | -3.02            |
| 8     | 52   | 2       | 0/8      | never         | +1.99            |
| 8     | 52   | 1       | 8/8      | 132           | -2.06            |

Note the two rows that finished every game while drifting upward, at five seats with a
penalty of 4 and seven seats with a penalty of 2. Their medians, 655 and 709 rounds, are
what a drifting table looks like when variance eventually rescues it. Neither is playable.

### The trade-off

This is a real cost, not a free fix. The penalty loses its bite exactly where blanks are
most common. At eight seats, winning nothing would cost one point while winning a single
trick gains one, so a disastrous round and a mediocre one end up nearly indistinguishable.
Five-seat tables drop from 5 to 3, which changes how the game feels at a size that
currently seems to work.

If that is unacceptable, the honest alternative is to deal more tricks rather than to
soften the penalty, since the shortage is tricks and not penalty size. See below.

### What it would touch

`blankPenalty` is currently a flat constant applied regardless of seat count
(`DEFAULT_BLANK_PENALTY`, used once in `configFromPreset`). The change is to derive it from
the seat count the way `defaultThreshold` already derives from the starting points: one new
function in `src/engine/config.ts` and one call site. The numbers do not fit a tidy formula,
so a lookup keyed on seat count is clearer than an expression.

It stays overridable in the custom-game form, which already exposes the field. Existing
games keep the `blankPenalty` stored in their config, so nothing in flight changes
underfoot.

## Alternatives considered

- **Deal more tricks at bigger tables.** Attacks the real cause. Constrained by the deck:
  52 cards across 8 players is 6.5 each before any draw pile for discards, so hand size
  cannot grow much past 5. Might work up to six seats.
- **Cap how many players are penalised per round.** Penalise only the worst blanks, keeping
  the penalty meaningful for those it hits. More rules to explain at the table.
- **Cap tables at five seats.** Simple, and drops `mesaGrande`, `party` and the six-seat
  `liga`. Note that five seats would still need the penalty lowered to 3.
- **Accept it for league play.** Treat big tables as ongoing, with standings as the point
  and the target score decorative. Costs nothing, but the win condition then lies, and
  `liga` starts players at 1000 points as though it meant something.

## Reproducing the measurement

The simulation drives `createRound` and `chooseAction` from `src/engine` in a loop, applying
`applyDeltas` between rounds and tracking `sitOutStreak` per seat, until a seat reaches zero
or a round cap is hit. It needs no database and no Convex runtime, because the engine is
pure. Bundle a driver with the bundled esbuild and run it on node.

Measure at a high starting score, report the mean table delta, and treat any
non-negative value as a failure however many games happened to finish.

Worth adding regardless of which remedy is chosen: a game-level test asserting that a table
of any legal seat count finishes within a generous bound, from a high starting score. That
assertion is what would have caught this.
