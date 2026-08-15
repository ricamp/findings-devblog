---
layout: "post"
title: "The threshold that never fired"
date: "2026-08-15"
numero: "0003"
resumo: "Calibration is in, fitted against real predictions for the first time. Platt won on out-of-fold Brier. Then I looked at what the calibrated distribution did to the report thresholds the project had been carrying, and found something worse than imprecision: the positive zone…"
tag: "bugfix"
model: "Damoiseau v1"
commit: "63d7925"
---

## The short version

Calibration is in, fitted against real predictions for the first time. Platt won
on out-of-fold Brier. Then I looked at what the calibrated distribution did to
the report thresholds the project had been carrying, and found something worse
than imprecision: the positive zone was dead. The highest calibrated probability
anywhere in the validation split is 0.6764. The upper threshold was 0.70. Not
one of 3,533 cases could reach it, so the branch of the report generator that
writes an affirmative sentence could never execute — and nothing anywhere would
have said so. The thresholds are now derived from the distribution instead of
guessed, and a second finding fell out of the derivation: no threshold makes
this model trustworthy enough to assert on its own.

## What changed

A classifier that scores radiographs is only half of Findings. The other half
turns a probability into a sentence of report text, and it decides which
sentence by comparing the probability against two thresholds — below the lower
one it writes a negative statement, above the upper one an affirmative one, in
between it declines to commit. Those two numbers had been 0.20 and 0.70 since
before there was a trained model to feed them.

The previous entry established that Damoiseau v1 ranks radiographs well and
measures them badly: sort order is sound, the probability scale is inflated.
That entry ended with calibration tooling that existed but had only ever run
against a synthetic fixture, needing one more Kaggle run to export the
validation probabilities as a CSV. That run happened. Platt and isotonic were
fitted against real predictions, the winner was applied, and the report
thresholds were re-derived from the corrected distribution rather than inherited
from the uncalibrated one.

The run artifacts — predictions, calibrator, thresholds, splits — are now
versioned in the repository instead of living in a notebook session.

## Numbers

Validation split, n = 3,533, prevalence 10.70%.

| Method | Brier (out-of-fold) |
|---|---|
| uncalibrated | 0.0878 |
| **Platt** | **0.0734** |
| isotonic | 0.0739 |

Platt wins where it counts. Out-of-fold is the only valid comparison here:
in-sample, isotonic leads and then loses outside, the expected pattern from a
method fitting 41 knots to 378 positives. The out-of-fold margin is narrow —
0.0005, well inside what a different fold seed would move — and a tie is itself
an argument for the method with fewer degrees of freedom to memorize with.
Fitted parameters: `a = 0.7573`, `b = -1.0215`.

The correction lands where the previous entry predicted. In the top band,
predicted 0.7790 against an observed frequency of 0.5028; after Platt, 0.4944.
The scale now means approximately what it says.

Setup, unchanged from the run in entry 0002: NIH ChestX-ray14, a 25,000-image
subset, 224 px, `convnext_tiny` pretrained on ImageNet, five epochs, batch 32,
Kaggle T4. Nothing was retrained for this entry — calibration is fitted after
the fact, on the validation split, never on test, and costs seconds on a CPU.

While versioning the artifacts I also settled a count I had been carrying
loosely. The subset covers **6,907 patients** — 4,835 train, 1,036 validation,
1,036 test — with prevalence 12.40 / 10.70 / 12.28%. The larger patient figure I
had in my head was the full NIH set, not the subset. Splits are by patient with
zero overlap between any pair, re-verified against the versioned split files.

## What the thresholds were hiding

The maximum calibrated probability across all 3,533 validation cases is
**0.6764**. Above 0.50 there are 153 cases, 4.3% of the split, and the top decile
averages 0.4939. The upper threshold sat above the model's entire output range.

So the system had two working states — "negative" and "I don't know" — and a
third that was unreachable. It would not have crashed, thrown, or logged
anything. It would have quietly never produced an affirmative sentence, and the
only symptom would have been an absence: a category that never shows up in
output. Absence is the hardest failure to notice, because nothing arrives to be
inspected. A wrong sentence gets caught by the first person who reads it. A
sentence that never appears waits for someone to ask why.

The thresholds are now derived from the calibrated distribution and versioned as
a JSON artifact alongside the metrics that justify them:

| | Old | New | Derivation |
|---|---|---|---|
| negative | 0.20 | **0.0382** | the sensitivity ≥ 0.90 operating point already on record, re-expressed on the calibrated scale |
| positive | 0.70 | **0.40** | lowest round cut with PPV ≥ 0.50 |

The negative cut is not a new number. It is the run's existing operating point
mapped through the calibrator, and it reproduces the recorded confusion matrix
digit for digit — 341 / 1,355 / 37 / 1,800, sensitivity 0.902, NPV 0.980. That
it reproduces exactly is the check that the calibration was applied in the right
direction; a sign error here would have been invisible in aggregate metrics.

The upper cut gives PPV 0.523, specificity 0.954, and asserts on 8.6% of cases.
**Its 95% confidence interval is 0.467–0.580, which does not exclude 0.50.** The
cut was chosen by the rule "PPV at least 0.50", and the interval around the
result contains 0.50. The point estimate alone would read as clearing the bar.
It does not clear it with any margin.

Zones on validation: 52.0% negative (observed prevalence 2.0%) · 39.4%
indeterminate (13.1%) · 8.6% positive (52.3%).

## The ceiling is a curve, not a number

The obvious next question is whether a better threshold exists — some cut where
the model asserts and is right often enough to matter. Answering it produced the
most useful thing in this entry, and I got it wrong twice before getting it
right.

"The PPV ceiling of this model" is not a number. It is a curve against how much
coverage you accept losing:

| Minimum n | PPV | Cut | n asserted | TP/FP |
|---|---|---|---|---|
| 1 | 0.857 | 0.658 | 14 | 12/2 |
| 20 | 0.810 | 0.649 | 21 | 17/4 |
| 30 | 0.733 | 0.630 | 30 | 22/8 |
| **50** | **0.635** | **0.594** | **52** | **33/19** |
| 100 | 0.606 | 0.543 | 104 | 63/41 |
| 200 | 0.540 | 0.466 | 200 | 108/92 |

Read the top row as the trap it is. A PPV of 0.857 sounds like a usable model.
It is twelve correct calls out of fourteen, at the far right tail of the
distribution. That number does not describe the model; it describes how little
sample was left after the cut. Requiring at least 50 assertions before a cut
counts, the ceiling is **0.635** at cut 0.594 — 52 cases, 1.5% of the split.

Publishing one figure hides the trade entirely. Where you stop *is* the
decision, and it belongs in the open.

## The threshold stopped deciding review

The upper cut was doing two jobs at once: choosing which sentence comes out, and
deciding whether the output gets flagged for mandatory human review. Those are
different questions. Which sentence is about where a case falls in the
distribution. Needs-review is about how trustworthy that zone has proven to be.
Tied together, the only way to avoid asserting nonsense was to raise the cut
until the sentence almost never appeared — trading harm for uselessness.

They are separated now, by a floor: an assertion may skip human escalation only
from a zone whose measured PPV is at least 0.80, four correct calls in five.
Damoiseau v1's ceiling is 0.635 at any usable sample size, so **every
affirmative sentence this model produces is flagged for review.**

That is the correct outcome, not a limitation to engineer around. The v1 has not
earned the right to assert on its own, and the system now says so structurally
rather than by my remembering to be careful. The floor is a parameter, so a
later model can clear it; nothing about this design assumes the answer stays no.

## What I got wrong

**The first version of the ceiling figure had no criterion behind it.** I wrote
"about 0.63 at any cut", from a sweep I ran by hand and stopped at 0.60 because
the numbers had stopped moving much. The 0.63 survived being checked, but by
luck: stopping at 0.60 was not a decision, it was where I got bored. Turning the
sweep into code is what surfaced the 0.857 tail and forced the minimum-sample
question into the open — the question that turned a number into the curve above.

**Then the correction note itself shipped an unverified number.** It said the
unrestricted maximum was six correct out of seven assertions. It is twelve out
of fourteen. The threshold artifact had always recorded fourteen correctly; a
docstring reduced 12/14 to 6/7, and the note copied the docstring instead of the
artifact. The error halves the apparent size of the tail, which weakens the
exact argument the note was making. Both are fixed, and an amendment is logged
where the original claim lives.

Three entries in, the mistake keeps arriving in the same shape: a number written
down with no artifact behind it. In 0002 it was a validation AUROC transcribed
by hand from notebook output. Here it was a threshold from a manual sweep, and
then a fraction from a docstring. The pattern is not carelessness about
arithmetic — every one of these was arithmetically fine when written. It is that
a number with no artifact has no way to be checked later, so it survives on
plausibility until something eventually forces it into code.

What these numbers still do not tell us: all of this is one validation split of
one run of one subset. The calibration parameters, the thresholds and the
ceiling curve are all estimates from 3,533 cases with 378 positives, and the
tail of that distribution is thin enough that the top rows of the curve are
nearly anecdote. Nothing here has been confirmed on test, deliberately — test
gets spent once, on a model that is ready for it.

## Next

1. Round 2: single execution, index caching, five epochs rather than eight. The
   Kaggle session budget does not stretch to eight, and planning for eight
   wastes a run discovering that.
2. Re-derive thresholds against round 2. The derivation is code now, so this is
   a command rather than an afternoon.
3. The bridge from classifier to report text stays disconnected until a round
   produces a zone that clears the 0.80 floor, or until the design accepts
   permanently that affirmative sentences are always escalated. Right now the
   second is true by measurement, not by choice.

---

*Findings is a research and portfolio project. It is not a medical device, is
not cleared by any regulator, and must not be used for patient care. Every
output carries a human-review flag by design. All data used here comes from
public research datasets.*
