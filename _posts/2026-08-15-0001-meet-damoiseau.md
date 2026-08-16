---
layout: "post"
title: "Meet Damoiseau"
date: "2026-08-15"
numero: "0001"
resumo: "I'm a doctor building a computer vision model that reads chest radiographs and turns what it sees into a sentence of report text. The first model has a name — Damoiseau — a first target finding, pleural effusion, and a first number on the board. This entry is the starting…"
tag: "new model"
model: "Damoiseau"
model_key: "damoiseau"
commit: "af88f02"
---

## The short version

I'm a doctor building a computer vision model that reads chest radiographs and
turns what it sees into a sentence of report text. The first model has a name —
**Damoiseau** — a first target finding, pleural effusion, and a first number on
the board. This entry is the starting line: what the project is, why it is built
this way, and what would have to be true for it to work. The numbers come next
entry.

## What changed

The project has a name, a shape, and now a model to point at.

**Findings** detects, and stops there. Turning a finding into finished report
prose is a separate concern, deliberately left outside this project. Keeping
those two apart is the whole design bet, and it runs against the current: the
obvious move in 2026 is one vision-language model, image in, paragraph out. I'm
not doing that. Findings is three replaceable pieces —

```
image encoder → finding head → text generator
```

— because a finding you can inspect before it becomes prose is a finding you can
argue with. When an end-to-end model writes "small right pleural effusion," you
cannot ask it which half of that sentence it was confident about. When the head
outputs a probability and the generator maps probability to phrasing, you can.
That is worth giving up some accuracy for, and I expect it will cost some.

**The first model is called Damoiseau.** Pleural fluid in an upright chest
radiograph does not sit flat. It climbs the lateral chest wall and traces an
S-shaped upper border — the Ellis–Damoiseau curve, described in the 19th century
by percussion, long before anyone could photograph it. Pleural effusion is the
first finding the project targets, so the model carries the sign's name.

The naming is a convention, not a flourish. `Damoiseau` names the model line;
`v1`, `v2` name training runs inside it. A change of architecture or base
dataset earns a new name from a new radiographic sign — not a bumped number.
Checkpoint filenames stay mechanical and separate.

**Why chest X-ray first.** Not because it is the most valuable problem. Because
it is the one where I can be my own reviewer. Pleural effusion is visually
robust, well represented in the public NIH ChestX-ray14 dataset, and I can
confirm or reject a model's call in about two seconds. A project where you
cannot personally check the label is a project where you will believe your own
metrics for months.

**Three rules the code enforces, not just the docs.** These are in the
repository's `CLAUDE.md` and asserted in tests:

1. **No horizontal flip, ever.** It is the default augmentation in every
   computer vision tutorial, and here it is clinically wrong: mirroring turns a
   right effusion into a left one and keeps the original label. A guard walks the
   transform pipeline and raises — including on `RandAugment` and friends, which
   hide a flip inside.
2. **Splits by patient, never by image.** One patient with twelve radiographs
   across train and test is leakage, and leakage looks exactly like success.
   A second guard hashes images and fails if the same picture reaches two splits
   under different filenames.
3. **Credentialed data never leaves the local machine.** NIH is free to use.
   MIMIC-CXR is not, and its data use agreement is a legal contract.

The number to distrust is 0.99. Published AUROC for pleural effusion sits
around 0.88–0.93. Anything near-perfect on a first attempt means I broke
something, not that I solved something.

## Numbers

Nothing to report here yet, by design — this entry is the announcement.
Damoiseau v1 has been trained once, on a subset, on a rented GPU, and it scored
inside the expected range. It also came out badly calibrated in a way that
matters more than the score does. That is entry 0002.

## What I got wrong

Too early to have been wrong about the model. What I can name is the bet that
could fail: the three-piece architecture assumes an inspectable finding is worth
more than end-to-end accuracy. If the gap turns out to be large, that assumption
gets expensive, and I would rather find out early and say so here than discover
it quietly and stop posting.

The second thing I'd flag about this entry: a project announcement is the
cheapest thing to write and the easiest to be confident in. Nothing here has
been tested against reality yet.

## Next

1. Entry 0002 — Damoiseau v1: the first real number, and the calibration problem
   that blocks connecting the classifier to report text.
2. Post-hoc calibration fit on the validation split.
3. PhysioNet credentialing, which unlocks MIMIC-CXR and, eventually, report
   generation rather than classification.

## Note — 2026-08-15

This entry originally named a separate app, **Laudo**, as the piece that turns a
finding into report prose, and carried the line "Findings detects, Laudo
writes." That framing has been removed throughout.

Laudo is a different project of mine, and tying the two together in public
implied a dependency that does not exist. Findings stands on its own: it
develops the models. Where report text is discussed here, it means the text
generator inside Findings, not another product.

The architectural claim is unchanged — detection and writing stay separate
components, and this project is not a single image-in-paragraph-out model. Only
the name of the thing on the other side of that line is gone.

---

*Findings is a research and portfolio project. It is not a medical device, is
not cleared by any regulator, and must not be used for patient care. Every
output carries a human-review flag by design. All data used here comes from
public research datasets.*
