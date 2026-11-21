import { isAssertionError } from './assertions';

/** An assertion failure reproduces the finding. Environment errors propagate. */
export async function observeKnownDiscrepancy(defectId: string, assertion: () => void | Promise<void>): Promise<string> {
  try {
    await assertion();
  } catch (error) {
    if (!isAssertionError(error)) throw error;
    const firstLine = String(error instanceof Error ? error.message : error).split('\n')[0];
    return `${defectId} still reproduces: ${firstLine}`;
  }
  throw new Error(
    `${defectId} no longer reproduces: the correct behaviour is now observed. ` +
      'Remove the @known-spec-discrepancy tag and the expectKnownDiscrepancy() wrapper to promote this test to the regression gate.',
  );
}
