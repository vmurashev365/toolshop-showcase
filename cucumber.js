const reportDir = (process.env.REPORT_DIR || 'reports/bdd').replaceAll('\\', '/');
const paths = ['tests/bdd/features/**/*.feature'];
const regressionTags = 'not @skip and not @known-spec-discrepancy';

// The target is quoted so absolute Windows paths ("C:/...") work: an unquoted colon would be
// parsed as the formatter/target separator.
const formatTo = (formatter, file) => `${formatter}:"${reportDir}/${file}"`;

const common = {
  requireModule: ['tsx/cjs'],
  require: ['tests/bdd/step-definitions/**/*.ts', 'tests/bdd/hooks/**/*.ts'],
  format: ['summary', formatTo('html', 'cucumber-report.html'), formatTo('json', 'cucumber-report.json')],
  formatOptions: {
    snippetInterface: 'async-await',
  },
  parallel: Number(process.env.PARALLEL) || 2,
  retry: process.env.CI ? 1 : 0,
  tags: process.env.TAGS || regressionTags,
  worldParameters: {
    browser: process.env.BROWSER || 'chromium',
    headed: process.env.HEADED === 'true',
    targetEnv: process.env.TARGET_ENV || 'live',
    timeout: Number(process.env.TIMEOUT) || 30_000,
  },
};

module.exports = {
  default: { ...common, paths },
  all: { ...common, paths, tags: process.env.TAGS || 'not @skip' },
};
