---
layout: "post"
title: "Damoiseau on pause, and the machine that spends the GPU"
date: "2026-08-18"
numero: "0004"
resumo: "Damoiseau, the chest-radiograph model this blog has been about for three entries, is paused. Not abandoned, not failed — paused, at AUROC 0.8792 on held-out test data, with its calibration in place. A competition appeared with a deadline attached, and a deadline is the one…"
tag: "new model"
model: "Segond"
commit: "86adba5"
model_key: "segond"
arte_ascii: " _______ _______ _______ _______ _______ _____\n|     __|    ___|     __|       |    |  |     \\\n|__     |    ___|    |  |   -   |       |  --  |\n|_______|_______|_______|_______|__|____|_____/"
---

## The short version

Damoiseau, the chest-radiograph model this blog has been about for three
entries, is paused. Not abandoned, not failed — paused, at AUROC 0.8792 on
held-out test data, with its calibration in place. A competition appeared with
a deadline attached, and a deadline is the one thing a portfolio project never
has. So there is a second model line now, called **Segond**, reading knee MRI
instead of chest X-ray. And there is a third thing, called **Ernst**, which is
not a model at all: it decides where the GPU time goes.

This entry is about why a deadline changed the shape of the project, and not
about how the competition is going. That part comes later, and the last section
explains why.

## What changed

### Damoiseau, frozen where it stands

Entry 0002 measured it and entry 0003 calibrated it. The state it is paused in:
AUROC 0.8792 on the test split, 95% CI 0.859–0.900, trained on a subset of NIH
ChestX-ray14, with Platt scaling fitted against real validation predictions.
Nothing about that is finished. The model was never trained on the full
dataset, the thresholds were re-derived once and never re-validated, and the
plan to split test data by institution rather than only by patient is still
just a plan.

Pausing something in that state is uncomfortable to write down, which is most
of the reason to write it down.

### Why a deadline changes what the work is

Without a deadline, the cost of a bad experiment is the experiment. You run it,
it does not work, you run another one. Compute is a background expense and
attention is the real budget.

With a deadline and a fixed quota of GPU-hours, that inverts. The question
stops being *how well can I train this model* and becomes *which experiment
deserves the next hour*. Those are different problems, and the second one is
not solved by being good at the first. You can lose a competition without ever
running a bad training job, purely by running the right jobs in the wrong
order.

That is the whole reason the project grew a third component instead of just a
second model.

### Segond

Named the same way Damoiseau was, after the radiographic sign it targets. The
Segond fracture is a fleck of bone pulled off the outer edge of the tibia at
the knee. It is small, easy to miss, and it matters mostly because of what
travels with it: find that fleck and the anterior cruciate ligament is torn
almost every time. A tiny finding that testifies to a large one — which is a
fair description of what this whole project is trying to build.

Two things make it a different engineering problem from Damoiseau rather than
the same one on new images. It reads MRI studies, which are stacks of slices
rather than a single frame. And it is multi-label: instead of answering one
yes-or-no question about effusion, it answers a dozen questions about one knee
at once, where the answers are correlated and some of them are rare.

The architecture is unchanged, and deliberately so: image encoder → finding
head → text generator, three replaceable pieces, with the finding inspectable
before it becomes a sentence. If that decomposition only worked for one finding
on one modality, it was never worth much.

### Ernst

Ernst is the layer that answers "where does the next GPU-hour go". It is not an
AutoML framework and not a learned optimiser. Three pieces: a runner that turns
a config into one standardised, recorded run; a surrogate that learns from the
recorded runs to predict how a run will end from how it starts, so a bad run
can be killed early; and a proposer that drafts batches of experiments for a
human to approve. It never launches a full run on its own.

The name is from NMR. Richard Ernst won a Nobel for making magnetic resonance
fast — for changing how the signal is acquired rather than what it shows. The
Ernst angle is the flip angle that yields the most signal per unit of time. It
is optimisation under a time budget, which is exactly the job. The other names
in this project are eponyms for things you can see in an image; this one is an
eponym for how you spend the clock, which is the right level for a thing that
never looks at a pixel.

## Numbers

| Metric | Value |
|---|---|
| Damoiseau, frozen | AUROC 0.8792 (test), 95% CI 0.859–0.900, Hanley–McNeil |
| Damoiseau, calibration | Platt, fitted on validation predictions (entry 0003) |
| Segond, trained result | **None.** Nothing has been trained yet |
| Ernst, runs recorded | **Zero.** The ledger exists and is empty |

There are no Segond numbers in this entry, and that is a choice rather than an
omission. The competition is open. Its rules forbid republishing its data, and
beyond the rules, the measurements that would be most interesting to write up
are exactly the ones that would save a competitor several weeks. Publishing
them now would be paying for other people's work with my own deadline.

So the technical entries about Segond are written and not published. They go up
after the competition closes, dated and unedited. A devblog that only publishes
what is convenient is not worth reading, so it is worth saying plainly that
this one is holding things back, for how long, and why.

## What I got wrong

I built Ernst completely before running it once.

Three modules, 868 lines, 50 passing tests. The ledger it writes to has never
had a row in it. And Ernst's own rules block it from doing its job in that
state: it is not allowed to rank one config above another until two things have
been measured — how well cheap short runs predict the order of full runs, and
how much the score moves between two identical runs that differ only in random
seed. Neither is measurable with zero runs on record.

So I built a system for making decisions whose first decision is blocked on
data I had not collected. The tests pass, and they are honest tests, but they
verify that the thing correctly refuses to answer. That is not the same as
verifying it answers correctly, and for a while I let the green checkmarks
stand in for the difference.

The second half of that noise-floor measurement is the part I would tell anyone
starting a project like this to do first. Until you know how much your score
moves when nothing changes, every comparison you make is a guess wearing a
number, and you will not find out for months.

## Next

1. The first GPU run for Segond, whose real purpose is not a score but the
   noise floor: the same configuration and the same code, twice, with only the
   seed changed. Everything Ernst does afterwards rests on that number.
2. Ernst gets its own entry once the ledger has runs in it and the surrogate
   has been checked against something other than synthetic history.

---

*Findings is a research and portfolio project. It is not a medical device, is
not cleared by any regulator, and must not be used for patient care. Every
output carries a human-review flag by design.*
