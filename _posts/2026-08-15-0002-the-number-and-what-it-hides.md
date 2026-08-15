---
layout: "post"
title: "Damoiseau v1: the number, and what it hides"
date: "2026-08-15"
numero: "0002"
resumo: "Damoiseau v1 scored an AUROC of 0.879 on held-out test data for pleural effusion — inside the published range, using 22% of the dataset, on a free Kaggle GPU. That is the good news and it is the least interesting thing in this entry. The model ranks radiographs well and…"
tag: "model update"
model: "Damoiseau v1"
commit: "8b83b17"
---

## The short version

Damoiseau v1 scored an AUROC of **0.879** on held-out test data for pleural
effusion — inside the published range, using 22% of the dataset, on a free
Kaggle GPU. That is the good news and it is the least interesting thing in this
entry. The model ranks radiographs well and *measures* them badly: when it says
0.70, the real answer is closer to 0.30. AUROC cannot see that, which is exactly
why the number looked fine. The fix does not require retraining, and it blocks
everything downstream until it lands.

## What changed

First real training run. NIH ChestX-ray14, a 25,000-image subset (~22% of the
full set), 224 px, `convnext_tiny` pretrained on ImageNet, five epochs, batch 32,
`pos_weight` set from the training split to handle class imbalance. Kaggle T4.

Splits are by patient, verified with zero overlap, prevalence holding near 12%
across train, validation and test. The second guard — hashing images to catch
the same picture appearing in two splits under different filenames — also passed.
This is the check I care most about, because leakage is the failure that looks
like success, and it is the one I would be most embarrassed to publish.

## Numbers

Test split, n = 3,869, prevalence 12.3%:

| Metric | Value |
|---|---|
| **AUROC (test)** | **0.8792** — 95% CI 0.859–0.900 (Hanley–McNeil, n⁺=475, n⁻=3,394) |
| AUROC (validation, best epoch 3/5) | 0.8497 — *corrected, see note below* |
| Brier | 0.1048 |
| Operating threshold (from validation, sensitivity ≥ 0.90) | 0.0517 |
| Sensitivity / Specificity | 0.962 / 0.542 |
| PPV / NPV | 0.227 / 0.990 |
| TP / FP / FN / TN | 457 / 1,556 / 18 / 1,838 |

Published AUROC for pleural effusion sits around 0.88–0.93, so 0.879 on a fifth
of the data is where a first run should land. The gap between validation and
test fits inside the confidence interval and means nothing. No sign of leakage.

**Read the confusion counts before celebrating the AUROC.** At a threshold tuned
for sensitivity, the model flags 2,013 radiographs and is right about 457 of
them. Seventy-seven percent of its alarms are false. That is a defensible
trade for a screening posture — it misses 18 of 475 effusions — but "AUROC
0.879" and "three out of four flags are wrong" are the same model, and only one
of those sentences shows up in abstracts.

## What I got wrong

**The model is systematically overconfident, and the headline metric is blind
to it.**

Binned by predicted probability, predicted and observed frequencies come apart
in the same direction everywhere:

```
bin        mean predicted    observed frequency
--------   --------------    ------------------
highest         0.82                0.57
next            0.66                0.28
```

Every bin overestimates. The cause is almost certainly `pos_weight` in
`BCEWithLogitsLoss`: it corrects class imbalance inside the loss, and it pays for
that by inflating the probability scale on the way out. The ordering survives —
the observed frequency still rises monotonically as predicted probability rises,
which is precisely why AUROC is happy. AUROC is invariant to any monotonic
transformation of the scores. It measures whether the model sorts. It says
nothing about whether the numbers mean anything.

This is not an academic complaint. Findings is built to hand a probability to a
text generator that maps probability to phrasing. The thresholds sitting in
`report.py` today — 0.20 and 0.70 — were written assuming the number means what
it says. Wiring the classifier to the report generator right now would produce
report sentences carrying inflated confidence, which is the exact failure the
human-review rule exists to contain. **So the bridge stays disconnected.** Not
as caution theater: the component is measurably unfit for the job it was built
for.

I had planned to connect them this month. Reading the calibration table is what
stopped it, and I would not have read the table if the AUROC had come out worse.
A mediocre score gets audited. A good score gets believed.

The recoverable part: monotonicity means the ranking is sound and the scale can
be repaired after the fact. Post-hoc calibration — Platt or isotonic, fit on the
**validation** split, never on test — costs seconds and no GPU.

## Next

1. The calibration tooling now exists in the repo (`src/calibrate.py`, commit
   `ccfec7b`): it fits Platt and isotonic side by side and reports both
   in-sample and out-of-fold, because in-sample flatters isotonic by
   construction — it has the freedom to memorize the validation set. It has not
   yet been run against Damoiseau's real predictions, only against a synthetic
   fixture. Doing that needs one more Kaggle run to export the validation
   probabilities as a CSV; the 45 GB of images live there, but the probabilities
   fit in a spreadsheet.
2. Entry 0003: calibration applied to real predictions, before and after.
3. Only then, the bridge to report text.

## Correction — 2026-08-15

This entry originally reported validation AUROC **0.8557 at best epoch 4/5**.
That number was wrong. The checkpoint stores its own provenance:

```
epoca: 3
val_auroc: 0.8496968782230272
```

Re-running evaluation on the validation split with the same `best.pt` returned
`0.8496968782230272` — identical to sixteen digits — with the operating threshold
coming out at `0.05170226842164993`, the same value already recorded from the
original run. The split reproduced exactly at 3,533 images.

The old figure also contradicts the training code: `train.py` writes `best.pt`
only when validation AUROC beats the previous best, so a peak of 0.8557 at epoch
4 would have left `epoca: 4` in the checkpoint. It didn't. The per-epoch curve
was transcribed by hand from notebook output because `history.json` was never
recovered from the session, and the error entered there.

**The test numbers are unaffected** — AUROC 0.8792, Brier 0.1048 and the
confusion counts all came from this same checkpoint and had already been
reproduced from it.

There is an obvious joke here, and I am not going to dodge it: an entry about
how a good-looking number escapes scrutiny shipped with a number I had not
checked against its own artifact. The validation AUROC was never load-bearing —
nothing in the argument depends on it, which is exactly why it slid through. The
calibration finding stands, the conclusion stands, and the number is now what
the checkpoint says it is. `history.json` is a required artifact from here on.

---

*Findings is a research and portfolio project. It is not a medical device, is
not cleared by any regulator, and must not be used for patient care. Every
output carries a human-review flag by design. All data used here comes from
public research datasets.*
