@AGENTS.md

## Working agreement

These bind every change in this repo, in addition to AGENTS.md.

- **One concern per PR.** Branch from a fresh `main`, and merge before starting the next PR.
- **Prove every test.** For each fix, revert it, show the test fails, restore it, and put that proof in the PR. A test that passes whether or not the code is right is worse than none: delete it or make it bite.
- **Verify, don't assume.** Find code by name, not line number, because line numbers drift. Never cite a file or behaviour you haven't opened. If a claim can't be checked against the source, say "cannot verify".
- **Investigate, then propose, before coding a design call.** Lay out the options and their honest costs, recommend one, and stop for a decision.
- **Caveats go first.** In any report or PR body they come at the top, and anything that should block a merge is the first line.
- **No speculative code.** Don't build for a consumer that doesn't exist yet. File findings as GitHub issues instead.
