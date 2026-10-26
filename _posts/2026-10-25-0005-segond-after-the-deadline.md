---
layout: "post"
title: "Segond, after the deadline"
date: "2026-10-25"
numero: "0005"
resumo: "The RSNA Knee Abnormality Detection competition closed on 22 October. Segond, the knee MRI model introduced in entry 0004, finished with a public leaderboard score of 0.958 and a private score of 0.942, out of roughly 6,400 teams. That number is not the interesting part. The…"
tag: "model update"
model: "Segond"
commit: "eb66c1b"
model_key: "segond"
---

## The short version

The RSNA Knee Abnormality Detection competition closed on 22 October. Segond,
the knee MRI model introduced in entry 0004, finished with a public leaderboard
score of 0.958 and a private score of 0.942, out of roughly 6,400 teams. That
number is not the interesting part. The interesting part is the gap between the
model I built and the score I finished with: my own recipe stalled at 0.882,
and most of the distance after that was covered by studying, retraining and
combining recipes the community had published. This entry is about what made
the problem hard, where my own work stopped moving, and why the project now
goes back to where it started.

## What changed

### What made it hard

Entry 0004 described the problem from the outside: a dozen findings per knee,
read from stacks of MRI slices instead of a single radiograph. Inside, three
things turned out to matter more than the architecture.

**The labels were mostly not labels.** Of 4,407 training studies, only 58 came
with a radiologist's answer for all twelve findings. The other 4,349 came with
the free-text report and nothing else — written in several languages, by
several institutions, each with its own way of saying "normal" or of not
mentioning something at all. Every training target had to be mined out of
those reports first, and the test set was scored against independent
radiologist annotations, not against reports. So the model was always learning
one thing and being graded on a slightly different one.

**The ruler was noisy.** With 58 trustworthy cases and mined labels for the
rest, local validation moved by amounts comparable to the effects I was trying
to measure. I pre-registered experiments, wrote down kill criteria before
seeing results, and ran seeds in pairs. That discipline kept me from fooling
myself. It did not make the ruler any sharper, and many of the experiments
ended in the same verdict: no difference detectable.

**The budget was fixed.** Inference had to run offline in under nine hours on
Kaggle hardware, and training had to fit a weekly GPU quota or a rented card.
A configuration that scored well but ran in nine hours and ten minutes scored
nothing. Some of the most expensive lessons were infrastructure, not modelling:
a single truncated DICOM file killing a run with the GPU already allocated, a
half-precision mode that the free GPUs silently do not support.

### Where my own work stopped moving

From late August to mid-September I iterated on a recipe of my own: sagittal
series, sixteen slices, a 2D backbone pooled across the stack. It climbed from
0.857 to 0.882 on the public leaderboard and then flattened. Ablations of slice
count, soft targets, per-plane pooling, multi-plane inputs and more capacity all
came back flat.

In late September I did the thing I should have done in week two: I took the
strongest recipe published in the competition forum and retrained it from
scratch in my own account. It landed at 0.928–0.933 on the first try, already
far above everything my recipe had produced. The best model trained end to end
by me — two variants of that recipe, one with labels I extracted from the
reports with a language model, averaged by rank — reached 0.936.

From there to 0.958, the gains came from ensembling and from exploring the
public notebooks: understanding which components carried the score, which
external pretrained weights they relied on, and how to blend them inside the
time limit. That was useful, and I learned more about how a competitive MRI
pipeline is assembled in those three weeks than in the five before them. It is
also honest to say that by then the score was no longer measuring something
Segond had learned that others had not.

## Numbers

| Stage | Public LB | Private LB |
|---|---|---|
| First submission (own recipe), 28 Aug | 0.857 | 0.839 |
| Own recipe, best (5-model rank ensemble), 14 Sep | 0.882 | 0.865 |
| Public recipe retrained in my account, 26 Sep | 0.933 | 0.918 |
| Best model trained end to end by me, 1 Oct | 0.936 | 0.923 |
| Final submission, 18 Oct | **0.958** | **0.942** |

Metric: macro-averaged AUROC over 12 findings, scored by Kaggle on a hidden
test set annotated by radiologists. 50 scored submissions in total.

On uncertainty: the leaderboard reports three decimals and no interval, so these
are not confidence intervals. Two things stand in for one. First, at the close,
well over a thousand teams were tied at exactly 0.958 on the public board — the
third decimal is where the competition was being decided, and it is inside the
noise of a test set this size. Second, every submission I made lost between
0.013 and 0.016 going from public to private, consistently, from the first one
to the last. The private split was harder, not differently ordered: the ranking
between my own submissions held. Public rank at the close was around 1,600th;
the private standings had not been finalised when this was written.

## What I got wrong

The rhythm, not the ideas. I spent five weeks optimising a weak recipe against a
noisy ruler before measuring what the strongest public baseline would do in my
hands. Each experiment in those weeks was carefully designed and correctly
read. Almost none of them could have moved the score enough to matter, and
cheap comparison against the public baseline would have shown that in a day.
Rigour applied to the wrong question is still the wrong question.

The second mistake is in entry 0004. I wrote that detailed technical entries
about Segond were written and waiting for the competition to close. They were
not — what existed were working notes, and most of them describe experiments
that ended in silence. This entry replaces them. If any of those dead ends turns
out to be useful to someone, it will get its own entry with its numbers, not a
promise.

## Next

1. Back to the project's starting point. The next entry is about Damoiseau, the
   chest radiograph model paused in entry 0004, and about the model that comes
   after it: **Greulich**, which estimates bone age from a hand and wrist
   radiograph, named after the Greulich–Pyle atlas that radiologists still
   read it against.
2. What the competition actually leaves behind: a pipeline that reads MRI
   stacks, a habit of pre-registering runs, and a much clearer sense of when to
   stop building alone and look at what already works.

---

*Findings is a research and portfolio project. It is not a medical device, is
not cleared by any regulator, and must not be used for patient care. Every
output carries a human-review flag by design.*
