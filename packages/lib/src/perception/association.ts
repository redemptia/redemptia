/**
 * Whether the association half of perception runs: association prompts are created when attributes
 * are saved, and the perception job judges their answers. Off since 2026-10-26: attribute figures
 * failed cross-model validation (calibration PROCEDURE.md §7b) and don't ship, so collecting their
 * answers paid for figures nobody sees. If association returns, it returns with a different question
 * shape, which needs its own answers. The code stays, dark.
 *
 * Leave it false through any real-key rollout: every figure this path feeds is dark, so judging it
 * would spend per call on verdicts nothing displays.
 */
export const ASSOCIATION_ENABLED = false;
