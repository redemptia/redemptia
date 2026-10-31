# Branching, committing and merging

**Status:** standing rules · **Version:** 1.0 · **Date:** 22 October 2026
**Companion docs:** `SPEC.md`, `EXECUTION-PLAN.md`, `CONSIDERATIONS.md`,
`UPSTREAM.md` (tracked in git)

Rules for how perception work moves through git. Read before creating a branch, opening a
PR, or merging a phase. When in doubt, the rule is whichever option keeps `main` comparable
to `upstream/main`.

---

## 1. The one rule everything else follows from

**`main` is the upstream catch-up lane. It stays that way.**

Every week `main` is diffed against `upstream/main`, upstream commits are merged in, and
migrations are renumbered. That process only works while `main` is a clean, legible
divergence from upstream — a short list of known edits, each with a reason in `UPSTREAM.md`.

Consequences:

- **Never make a feature branch the repo default.** Catch-up merges would land in a branch
  full of in-flight work, and the clean comparison point disappears exactly when it is
  needed.
- **Merge direction is always `main` → feature branch.** Divergence rebases onto upstream,
  never the reverse.
- **Nothing lands on `main` without an `UPSTREAM.md` entry in the same commit**, if it
  touches an elmo file.

---

## 2. What goes straight to `main`

Work that is good for Redemptia whether or not perception ships, and work that is inert
until a flag turns it on. Each as its own small PR.

| Work | Why `main` | Phase |
|---|---|---|
| Our own spend ceiling — prompt cap, daily call ceiling, answer cap | Useful infrastructure regardless; nothing perception-specific in it | 0.1 |
| The captured Jev fixture | A test fixture. No behaviour. | 0.2 |
| **The headline exclusion** | Perception-specific, but inert alone — an unused `exclude` option and a few call sites passing an empty set. Having it on `main` means no feature branch ever carries it through a catch-up, which is where it would hurt most. | 0.3 |
| Calibration corpus | Test data | 0.4 |
| New tables and migrations | Additive; nothing reads them until a job exists | 1.1, 1.6 |

The exclusion is the judgement call in that list, and the reason it goes to `main` is merge
cost: it is the only change that touches several elmo server files, so it is the one change
you least want sitting on a branch while upstream moves underneath it.

---

## 3. What goes on a branch

Work in flight. **One branch per phase, never one for the whole build.**

```
perception/facts          → Phase 1
perception/attributes     → Phase 1.5
perception/prominence     → Phase 2
perception/audits         → Phase 3
perception/discovery      → Phase 4
```

Six phases over months on a single long-lived branch is a merge-pain machine. Each phase has
a gate, and a gate is a natural merge point.

**Branch from `main`, merge back to `main` when the phase's gate passes and the feature is
default-off.** The branch exists to hold work in progress, not to keep finished work away
from `main`.

Phases 1.5 and 2 may run in parallel on separate branches once Phase 1's gate has passed —
they touch different tables and different read paths.

---

## 4. Shipping dark, not shipping late

"Verify fully in production, then merge" does not work when production runs from `main`.
Nothing reaches production until it is merged, so the sequence is the other way round:

```
gate passes → merge to main, default-off → enable for one brand → verify → enable more
```

Default-off is what makes this safe, and it is why every phase's done condition includes
"default-off". A merged phase that nobody has enabled costs nothing and has stopped
accumulating merge debt.

**A phase does not merge before its gate.** Phase 1 in particular does not merge until the
accuracy gate passes — merging an unverified classifier dark is still merging an unverified
classifier.

---

## 5. Weekly catch-up

```
1. On main:   git fetch upstream && merge upstream/main
2.            renumber migrations, gated by `when`
3.            regenerate routeTree.gen.ts — never hand-merge it
4.            reconcile UPSTREAM.md against the actual diff
5. On each live feature branch:  merge main in
```

Step 4 is not optional bookkeeping. If an upstream change touched a file on the allowed-
divergence list, that is the moment to notice.

Step 5 happens on every live branch, every week, even when the branch is quiet. A branch that
skips three catch-ups is a conflict waiting to be discovered at the worst time.

**A catch-up that produces a conflict in an elmo file on the allowed list is a stop-and-
report**, not a resolve-and-continue — it means upstream changed something the divergence
depends on.

---

## 6. Commits

- **Scope a commit to one thing.** A schema commit, a job commit, a UI commit. Not "Phase 1".
- **An elmo-file edit and its `UPSTREAM.md` entry go in the same commit.** Not a follow-up,
  not a cleanup pass. Without the list being accurate at every point, month four is
  archaeology.
- **An elmo-file edit outside the allowed list does not get committed.** It stops for a
  decision first (`EXECUTION-PLAN.md` §Allowed divergences).
- **Explain metric changes in the changelog**, not just in the commit. When a number moves,
  the reader needs to know whether reality changed or the definition did.
- Migrations are never edited after they run. A fix is a new migration.

### Commit message shape

```
perception(facts): add brand_facts and fact_verdicts tables

<what and why in a line or two>

UPSTREAM: none            ← or the files touched, matching UPSTREAM.md
```

---

## 7. Pull requests

One PR per coherent unit, not per phase. A phase of work is several PRs.

Every PR touching an elmo file states, in its description:

- which allowed-divergence row it implements,
- what the change does when the feature is off (ideally: nothing),
- how it was verified.

PRs that only add new files and tables need none of that.

---

## 8. Quick reference

| Situation | Action |
|---|---|
| Starting a phase | Branch from current `main`: `perception/<phase>` |
| Phase gate passed, default-off | Merge to `main` |
| Gate failed | Stop. Do not merge. Report numbers and failure modes. |
| Upstream released | Catch up on `main` first, then merge `main` into each live branch |
| Need to edit an unlisted elmo file | Stop and ask |
| Catch-up conflicts in a listed elmo file | Stop and report |
| Two phases ready in parallel | Separate branches, merge independently |
| Tempted to make a feature branch default | Don't |
