import {
  After,
  AfterAll,
  AfterStep,
  Before,
  BeforeStep,
  Status,
  setDefaultTimeout,
} from '@cucumber/cucumber';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ToolshopWorld, closeWorkerBrowser } from './World';

const actionTimeout = Number(process.env.TIMEOUT) || 30_000;
const reportDir = process.env.REPORT_DIR || 'reports/bdd';
setDefaultTimeout(actionTimeout + 5_000);

async function closeTraceGroup(world: ToolshopWorld): Promise<void> {
  if (!world.traceGroupOpen || !world.context) return;
  await world.context.tracing.groupEnd();
  world.traceGroupOpen = false;
}

Before(async function (this: ToolshopWorld, { pickle }) {
  await this.initApi();
  const isApiOnly = pickle.tags.some((t) => t.name === '@api');
  if (!isApiOnly) {
    await this.initBrowser();
  }
});

BeforeStep(async function (this: ToolshopWorld, { pickleStep }) {
  if (!this.tracing || !this.context) return;
  await this.context.tracing.group(pickleStep.text);
  this.traceGroupOpen = true;
});

AfterStep(async function (this: ToolshopWorld) {
  await closeTraceGroup(this);
});

After(async function (this: ToolshopWorld, { pickle, result, testCaseStartedId }) {
  const failed = Boolean(result && result.status !== Status.PASSED && result.status !== Status.SKIPPED);
  const stem = `${pickle.name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)}-${testCaseStartedId}`;

  try {
    if (failed && this.page && !this.page.isClosed()) {
      await mkdir(join(reportDir, 'screenshots'), { recursive: true });
      const img = await this.page.screenshot({ path: join(reportDir, 'screenshots', `${stem}.png`), fullPage: true });
      this.attach(img, 'image/png');
    }

    if (this.tracing && this.context) {
      await closeTraceGroup(this);
      if (failed) {
        await mkdir(join(reportDir, 'traces'), { recursive: true });
        await this.context.tracing.stop({ path: join(reportDir, 'traces', `${stem}.zip`) });
      } else {
        await this.context.tracing.stop();
      }
    }
  } finally {
    await this.dispose();
  }
});

AfterAll(async function () {
  await closeWorkerBrowser();
});
