import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createSQLiteTestDatabase } from './sqlite-d1-adapter.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'node_modules', 'wrangler', 'package.json'));
const tempBase = path.resolve(os.tmpdir());
const tempDir = fs.mkdtempSync(path.join(tempBase, 'lopokao-read-view-scope-'));
const tempPrefix = (tempBase.endsWith(path.sep) ? tempBase : tempBase + path.sep).toLowerCase();
if (!path.resolve(tempDir).toLowerCase().startsWith(tempPrefix)) throw new Error('Unsafe temporary directory');

const bundle = path.join(tempDir, 'read-view-scope-test.mjs');
const entry = path.join(tempDir, 'read-view-scope-entry.ts');
let db;

try {
  const modules = ['OrderContract.ts', 'OrderWriteService.ts', 'CatalogService.ts']
    .map(file => `export * from ${JSON.stringify(path.join(root, 'src/services', file))};`)
    .join('\n');
  fs.writeFileSync(entry, modules);
  require('esbuild').buildSync({
    entryPoints: [entry],
    outfile: bundle,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    nodePaths: [path.join(root, 'node_modules')],
  });
  const { OrderWriteService } = await import(pathToFileURL(bundle));

  db = createSQLiteTestDatabase();
  db.prepare('CREATE TABLE order_inventory (order_id TEXT PRIMARY KEY, proof TEXT)').run();
  db.prepare('CREATE TABLE stock_reservations (id TEXT PRIMARY KEY, state TEXT, quantities TEXT, snapshot TEXT)').run();
  db.prepare('CREATE TABLE order_operations (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, phase TEXT NOT NULL)').run();

  const fixtureDb = {
    prepare: sql => db.prepare(sql),
    batch: async statements => {
      batchSizes.push(statements.length);
      return db.batch(statements);
    },
  };
  const batchSizes = [];
  const store = { locate: async () => [], write: async () => {}, rows: async () => [] };
  const service = new OrderWriteService(fixtureDb, store);
  const uuidFor = value => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
  const pageIds = Array.from({ length: 81 }, (_, index) => uuidFor(2000 + index));
  const phases = ['prepared', 'sheet_submitting', 'pending'];
  let operationNumber = 0;
  const insertOperation = (orderId, phase) => {
    operationNumber += 1;
    db.prepare('INSERT INTO order_operations (id, order_id, phase) VALUES (?, ?, ?)')
      .bind(`fixture-operation-${operationNumber}`, orderId, phase).run();
  };

  for (let index = 0; index < 1001; index += 1) {
    insertOperation(uuidFor(index + 1), phases[index % phases.length]);
  }
  pageIds.slice(0, 3).forEach((id, index) => insertOperation(id, phases[index]));
  const secondChunkId = pageIds[80];
  insertOperation(secondChunkId, 'pending');
  const nonTargetId = uuidFor(9000);
  insertOperation(nonTargetId, 'pending');

  await service.loadReadView([...pageIds, pageIds[0], 'legacy-row']);

  assert.deepEqual(batchSizes, [3, 3], '81 unique valid IDs are read in 80-ID chunks with three queries per chunk');
  const readPending = service.readPending;
  assert.equal(readPending.size, 4, 'only pending order IDs from the current page are cached');
  assert.ok(!readPending.has(nonTargetId), 'pending IDs outside the current page are excluded');
  for (const id of [...pageIds.slice(0, 3), secondChunkId]) {
    const row = Array(18).fill('');
    row[1] = 'Synthetic fixture';
    row[8] = 'Synthetic fixture x 1';
    row[9] = '100';
    row[16] = id;
    assert.equal((await service.decorate(row)).operation_pending, true, `pending operation is found for ${id}`);
  }

  const nonTargetRow = Array(18).fill('');
  nonTargetRow[1] = 'Synthetic fixture';
  nonTargetRow[8] = 'Synthetic fixture x 1';
  nonTargetRow[9] = '100';
  nonTargetRow[16] = nonTargetId;
  assert.equal((await service.decorate(nonTargetRow)).operation_pending, false);

  let noIdQueries = 0;
  const noIdDb = {
    prepare: sql => {
      noIdQueries += 1;
      return db.prepare(sql);
    },
    batch: statements => {
      noIdQueries += 1;
      return db.batch(statements);
    },
  };
  await new OrderWriteService(noIdDb, store).loadReadView(['legacy-row', '']);
  assert.equal(noIdQueries, 0, 'invalid and legacy IDs issue no read-view queries');

  const incompleteDb = {
    prepare: sql => db.prepare(sql),
    batch: async () => [{ results: [] }, { results: [] }, null],
  };
  await assert.rejects(
    () => new OrderWriteService(incompleteDb, store).loadReadView([pageIds[0]]),
    error => error.code === 'ORDER_VIEW_UNAVAILABLE',
    'a missing pending-query result fails the read instead of becoming an empty pending set',
  );
} finally {
  db?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
