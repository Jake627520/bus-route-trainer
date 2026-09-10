import { RecallMode, RecallOutcome } from './recall-session';

/**
 * Normalizes stop name using Unicode NFKC -> trim -> lowercase -> collapse whitespace.
 */
export function normalizeStopName(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export class DeterministicRecallEvaluator {
  /**
   * Deterministically evaluates the driver's raw input against the expected answer.
   * Strictly returns PASS or FAIL (binary evaluation, no partial credit).
   */
  evaluate(
    mode: RecallMode,
    rawInput: string,
    expectedAnswer: string,
  ): RecallOutcome {
    if (!rawInput || rawInput.trim() === '') {
      return RecallOutcome.FAIL;
    }

    if (mode === RecallMode.NEXT_STOP_FORWARD) {
      // Exact canonical stopId match after trimming whitespace
      return rawInput.trim() === expectedAnswer
        ? RecallOutcome.PASS
        : RecallOutcome.FAIL;
    }

    if (mode === RecallMode.STOP_NAME_RECOGNITION) {
      // Unicode NFKC normalized string match against pre-normalized expectedAnswer
      const normalizedInput = normalizeStopName(rawInput);
      const normalizedExpected = normalizeStopName(expectedAnswer);
      return normalizedInput === normalizedExpected
        ? RecallOutcome.PASS
        : RecallOutcome.FAIL;
    }

    return RecallOutcome.FAIL;
  }
}
