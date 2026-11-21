import { Formatter, Status, type IFormatterOptions } from '@cucumber/cucumber';

export type TerminalMode = 'compact' | 'silent';

export function resolveTerminalMode(env: NodeJS.ProcessEnv = process.env): TerminalMode {
  const raw = (env.TERMINAL_MODE ?? env.TOOLSHOP_TERMINAL_MODE)?.trim().toLowerCase();
  if (raw === 'silent' || raw === 'off' || raw === 'false') {
    return 'silent';
  }
  return 'compact';
}

export function isTerminalColorEnabled(
  env: NodeJS.ProcessEnv = process.env,
  isTTY = Boolean(process.stdout.isTTY),
): boolean {
  if (env.NO_COLOR) {
    return false;
  }
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') {
    return true;
  }
  return isTTY;
}

export function formatDuration(elapsedMs: number): string {
  const safeMs = Math.max(0, Math.round(elapsedMs));
  if (safeMs < 1000) {
    return `${safeMs}ms`;
  }
  const seconds = safeMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function formatTotalClock(elapsedMs: number): string {
  const safeMs = Math.max(0, elapsedMs);
  const totalSeconds = safeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(3).padStart(6, '0');
  return `${minutes}m${seconds}s`;
}

function durationToMs(duration?: { seconds?: number; nanos?: number }): number {
  if (!duration) return 0;
  return (duration.seconds ?? 0) * 1000 + (duration.nanos ?? 0) / 1e6;
}

export function formatStepStatus(status?: string): string {
  if (status === Status.PASSED) return 'PASS';
  if (status === Status.FAILED) return 'FAIL';
  if (status === Status.SKIPPED) return 'SKIP';
  if (status === Status.PENDING) return 'PEND';
  if (status === Status.UNDEFINED) return 'UNDEF';
  if (status === Status.AMBIGUOUS) return 'AMBIG';
  return (status ?? Status.UNKNOWN).toString().toUpperCase();
}

export function colorStatus(status: string, colorEnabled: boolean): string {
  if (!colorEnabled) {
    return status;
  }
  const code =
    status === 'PASS' || status === 'PASSED'
      ? '\u001b[32m'
      : status === 'FAIL' || status === 'FAILED' || status === 'AMBIG'
        ? '\u001b[31m'
        : '\u001b[33m';
  return `${code}${status}\u001b[0m`;
}

function collectGherkinStepKeywords(document: unknown): Map<string, string> {
  const keywords = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const item = value as Record<string, unknown>;
    if (typeof item.id === 'string' && typeof item.keyword === 'string' && typeof item.text === 'string') {
      keywords.set(item.id, item.keyword.trim());
    }
    Object.values(item).forEach(visit);
  };
  visit(document);
  return keywords;
}

function keywordForPickleStep(keywords: Map<string, string>, astNodeIds: readonly string[] = []): string {
  return astNodeIds.map((id) => keywords.get(id)).find(Boolean) ?? 'Step';
}

function formatStepLine(input: {
  status: string;
  elapsedMs: number;
  keyword: string;
  text: string;
  colorEnabled: boolean;
}): string {
  const badge = colorStatus(input.status, input.colorEnabled);
  const duration = formatDuration(input.elapsedMs).padEnd(7);
  return `  ${badge} · ${duration} ${input.keyword} ${input.text}`;
}

function formatScenarioFooter(input: {
  status: string;
  elapsedMs: number;
  colorEnabled: boolean;
  willBeRetried?: boolean;
}): string {
  const badge = colorStatus(input.status, input.colorEnabled);
  const duration = formatDuration(input.elapsedMs);
  const outcome = input.willBeRetried
    ? 'Scenario failed (will retry)'
    : input.status === 'PASS'
      ? 'Scenario completed'
      : input.status === 'FAIL'
        ? 'Scenario failed'
        : 'Scenario finished';
  return `└─ ${badge} · ${duration}  ${outcome}`;
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function formatStatusCounts(counts: Map<string, number>): string {
  const order = [Status.FAILED, Status.AMBIGUOUS, Status.UNDEFINED, Status.PENDING, Status.SKIPPED, Status.PASSED];
  const parts: string[] = [];
  for (const status of order) {
    const n = counts.get(status);
    if (n && n > 0) {
      parts.push(`${n} ${status.toLowerCase()}`);
    }
  }
  return parts.join(', ');
}

interface FailureRecord {
  scenarioName: string;
  uri: string;
  stepLine: string;
  message: string;
}

/**
 * Parallel-safe compact terminal formatter matching ParaBank_v4's visual output:
 *   [1] Scenario: ...
 *     PASS · 50ms    Given ...
 *   └─ PASS · 297ms  Scenario completed
 *
 * Runs in Cucumber's coordinator process so scenarios executed across parallel workers
 * are flushed as atomic blocks with sequential numbering and zero interleaved step lines.
 */
export default class TerminalFormatter extends Formatter {
  private readonly terminalMode: TerminalMode;
  private readonly colorEnabled: boolean;
  private readonly isDryRun: boolean;
  private readonly keywordCache = new Map<string, Map<string, string>>();
  private readonly scenarioCounts = new Map<string, number>();
  private readonly stepCounts = new Map<string, number>();
  private readonly failures: FailureRecord[] = [];
  private scenarioOrdinal = 0;
  private runStartedAt = 0;
  private totalStepsMs = 0;

  constructor(options: IFormatterOptions) {
    super(options);
    this.terminalMode = resolveTerminalMode();
    this.colorEnabled = isTerminalColorEnabled(process.env, Boolean((options.stream as { isTTY?: boolean }).isTTY));
    this.isDryRun = process.argv.includes('--dry-run');

    options.eventBroadcaster.on('envelope', (envelope: Record<string, unknown>) => {
      if (envelope.testRunStarted) {
        this.runStartedAt = Date.now();
      } else if (envelope.testCaseFinished) {
        const finished = envelope.testCaseFinished as { testCaseStartedId: string; willBeRetried?: boolean };
        this.handleTestCaseFinished(finished.testCaseStartedId, Boolean(finished.willBeRetried));
      } else if (envelope.testRunFinished) {
        this.handleTestRunFinished();
      }
    });
  }

  private getKeywords(uri: string, gherkinDocument: unknown): Map<string, string> {
    let map = this.keywordCache.get(uri);
    if (!map) {
      map = collectGherkinStepKeywords(gherkinDocument);
      this.keywordCache.set(uri, map);
    }
    return map;
  }

  private handleTestCaseFinished(testCaseStartedId: string, willBeRetried: boolean): void {
    const attempt = this.eventDataCollector.getTestCaseAttempt(testCaseStartedId);
    const { pickle, gherkinDocument, testCase, stepResults, worstTestStepResult } = attempt;
    const keywords = this.getKeywords(pickle.uri, gherkinDocument);
    const pickleStepsById = new Map(pickle.steps.map((s) => [s.id, s]));

    let scenarioMs = 0;
    const lines: string[] = [];
    let firstFailureStep = '';
    let firstFailureMessage = '';

    for (const testStep of testCase.testSteps) {
      const result = stepResults[testStep.id];
      const elapsedMs = durationToMs(result?.duration);
      scenarioMs += elapsedMs;

      if (!testStep.pickleStepId) {
        // Hook step: record failure if hook broke, but do not print as a Gherkin step
        if (result && result.status === Status.FAILED && !firstFailureMessage) {
          firstFailureStep = 'Hook';
          firstFailureMessage = result.message ?? 'Hook failed';
        }
        continue;
      }

      const pickleStep = pickleStepsById.get(testStep.pickleStepId);
      if (!pickleStep) continue;

      const status = result?.status ?? Status.UNKNOWN;
      if (!willBeRetried) {
        this.stepCounts.set(status, (this.stepCounts.get(status) ?? 0) + 1);
        this.totalStepsMs += elapsedMs;
      }

      const keyword = keywordForPickleStep(keywords, pickleStep.astNodeIds);
      const statusText = formatStepStatus(status);
      lines.push(
        formatStepLine({
          status: statusText,
          elapsedMs,
          keyword,
          text: pickleStep.text,
          colorEnabled: this.colorEnabled,
        }),
      );

      if (status === Status.FAILED && result?.message) {
        const firstLine = result.message
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.length > 0);
        if (firstLine) {
          lines.push(`     ${firstLine}`);
        }
        if (!firstFailureMessage) {
          firstFailureStep = `${keyword} ${pickleStep.text}`;
          firstFailureMessage = result.message;
        }
      } else if ((status === Status.UNDEFINED || status === Status.AMBIGUOUS) && !firstFailureMessage) {
        firstFailureStep = `${keyword} ${pickleStep.text}`;
        firstFailureMessage = result?.message ?? `Step is ${status.toLowerCase()}`;
      }
    }

    const worstStatus = worstTestStepResult?.status ?? Status.UNKNOWN;
    if (!willBeRetried) {
      this.scenarioCounts.set(worstStatus, (this.scenarioCounts.get(worstStatus) ?? 0) + 1);
      if (worstStatus === Status.FAILED || worstStatus === Status.UNDEFINED || worstStatus === Status.AMBIGUOUS) {
        this.failures.push({
          scenarioName: pickle.name,
          uri: pickle.uri,
          stepLine: firstFailureStep,
          message: firstFailureMessage,
        });
      }
    }

    if (this.terminalMode === 'compact' && !this.isDryRun) {
      this.scenarioOrdinal += 1;
      const footer = formatScenarioFooter({
        status: formatStepStatus(worstStatus),
        elapsedMs: scenarioMs,
        colorEnabled: this.colorEnabled,
        willBeRetried,
      });
      this.log(`\n[${this.scenarioOrdinal}] Scenario: ${pickle.name}\n${lines.join('\n')}\n${footer}\n`);
    }
  }

  private handleTestRunFinished(): void {
    const runElapsedMs = this.runStartedAt > 0 ? Date.now() - this.runStartedAt : 0;

    if (this.failures.length > 0) {
      this.log('\nFailures:\n');
      this.failures.forEach((f, idx) => {
        this.log(`\n${idx + 1}) Scenario: ${f.scenarioName} # ${f.uri}\n`);
        if (f.stepLine) {
          this.log(`   Step: ${f.stepLine}\n`);
        }
        if (f.message) {
          const indented = f.message
            .split('\n')
            .slice(0, 12)
            .map((line) => `   ${line}`)
            .join('\n');
          this.log(`${indented}\n`);
        }
      });
      if (this.failures.some(({ message }) => /connect ECONNREFUSED (?:127\.0\.0\.1|::1):\d+\b/.test(message))) {
        this.log(
          '\nA local endpoint refused the connection. Check that the Toolshop stack is running ' +
            'and run `npm run check:local` to verify the UI and API. See "Run it locally" in README.md.\n',
        );
      }
    }

    const totalScenarios = [...this.scenarioCounts.values()].reduce((a, b) => a + b, 0);
    const totalSteps = [...this.stepCounts.values()].reduce((a, b) => a + b, 0);
    const scenarioBreakdown = formatStatusCounts(this.scenarioCounts);
    const stepBreakdown = formatStatusCounts(this.stepCounts);

    this.log('\n');
    this.log(`${plural(totalScenarios, 'scenario')}${scenarioBreakdown ? ` (${scenarioBreakdown})` : ''}\n`);
    this.log(`${plural(totalSteps, 'step')}${stepBreakdown ? ` (${stepBreakdown})` : ''}\n`);
    this.log(`${formatTotalClock(runElapsedMs)} (executing steps: ${formatTotalClock(this.totalStepsMs)})\n`);
  }
}
