import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(apiRoot, 'node_modules', 'wrangler', 'package.json'));
const esbuild = require('esbuild');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lopokao-dashboard-calendar-'));
const entry = path.join(temporary, 'entry.ts');
const bundle = path.join(temporary, 'calendar.mjs');
fs.writeFileSync(entry, `export {parseSheetOrderDate,weekStartSunday,countDashboardOrderDates} from ${JSON.stringify(path.join(apiRoot, 'src/services/DashboardCalendar.ts'))};\n`);
await esbuild.build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'browser', format: 'esm' });
const { parseSheetOrderDate, weekStartSunday, countDashboardOrderDates } = await import(pathToFileURL(bundle).href);

try {
  assert.equal(parseSheetOrderDate('2026-10-02'), '2026-10-02');
  assert.equal(parseSheetOrderDate('2026-10-02T00:00:00'), '2026-10-02', 'Timezone-less ISO values retain the Sheet calendar date');
  assert.equal(parseSheetOrderDate('2026-10-02 23:59:59'), '2026-10-02', 'Timezone-less date-times remain on their Sheet calendar date');
  assert.equal(parseSheetOrderDate('2026/9/28'), '2026-09-28');
  assert.equal(parseSheetOrderDate('2026/9/28 23:59:59'), '2026-09-28', 'Timezone-less slash dates use the Sheet calendar date');
  assert.equal(parseSheetOrderDate('9/28/2026'), '2026-09-28');
  assert.equal(parseSheetOrderDate('2026-10-01T16:00:00Z'), '2026-10-02', 'Explicit UTC timestamp is converted to Taipei date');
  assert.equal(parseSheetOrderDate('2026-10-01T23:30:00-02:00'), '2026-10-02', 'Explicit offset timestamp is converted to Taipei date');
  assert.equal(parseSheetOrderDate('2026-10-02T00:30:00+14:00'), '2026-10-01', 'An explicit positive offset may resolve to the previous Taipei date');
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-10-02T25:00:00', '2026-10-02T12:00:00+14:01', '2026-10-02 garbage', '']) {
    assert.equal(parseSheetOrderDate(invalid), null, `Invalid date is ignored: ${invalid}`);
  }

  assert.equal(weekStartSunday('2026-10-02'), '2026-09-27');
  assert.equal(weekStartSunday('2026-10-04'), '2026-10-04', 'Sunday is the first day of the week');

  const fridayAtTaipeiMidnight = new Date('2026-10-01T16:00:00Z');
  assert.deepEqual(countDashboardOrderDates([
    '2026-10-02',
    '2026-10-02T00:00:00',
    '2026-10-01T16:00:00Z',
    '2026-10-01T23:30:00-02:00',
    '2026-10-02T00:30:00+14:00',
    '2026-09-26',
    '2026-09-27',
    '2026/9/28',
    '2026-10-03',
    '2026-02-30',
  ], fridayAtTaipeiMidnight), { todayOrders: 4, weekOrders: 7 });

  const sundayAtTaipeiMidnight = new Date('2026-10-03T16:00:00Z');
  assert.deepEqual(countDashboardOrderDates(['2026-10-03', '2026-10-04', '2026-10-05'], sundayAtTaipeiMidnight), {
    todayOrders: 1,
    weekOrders: 1,
  }, 'Sunday starts the week and future dates are excluded from both counts');

  console.log('PASS: Dashboard date counts use Taipei calendar days, explicit ISO offsets convert as instants, future dates are excluded, Sunday starts the week, and invalid dates are skipped.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
