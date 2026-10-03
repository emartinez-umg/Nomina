import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../shared/schema.json' with { type: 'json' };
import { validDate, validatePayload } from '../shared/validation.js';
import { birthBounds } from '../shared/business-rules.js';
import { validNit, nitCheckDigit } from '../shared/identification.js';
import { createCatalog } from '../backend/src/config/catalog.js';
import { listQuery } from '../backend/src/repositories/repository.js';
import { recordVersion, assertVersion } from '../backend/src/services/record-version.js';
import { readDrafts, writeDraft, draftPrefix } from '../frontend/src/state/draft-storage.js';
import { passwordHash, verifyPassword } from '../backend/src/services/auth.js';
import { roles, canUseTable, canOpenPage } from '../shared/access.js';
const table = (name) => [...schema.tables, ...schema.masters].find((t) => t.name === name);
test('birth and query validation reject rollover dates and future birthdays', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  const person = table('ERP_PERSONA');
  assert.ok(
    validatePayload(person, { PER_FECHA_NACIMIENTO: '2099-01-01' }).errors.PER_FECHA_NACIMIENTO,
  );
  assert.ok(
    validatePayload(person, { PER_FECHA_NACIMIENTO: '1939-12-31' }).errors.PER_FECHA_NACIMIENTO,
  );
  assert.deepEqual(
    birthBounds(new Date(2024, 1, 29), { hiringMinimumAge: 18, birthMinimum: '1940-01-01' }),
    { min: '1940-01-01', max: '2006-02-28' },
  );
  for (const query of [
    { dateField: 'PER_FECHA_NACIMIENTO', from: '2026-02-29' },
    { filterField: 'PER_FECHA_NACIMIENTO', filterValue: '2026-04-31' },
    { filter_PER_FECHA_NACIMIENTO: '2026-02-29' },
  ])
    assert.throws(
      () => listQuery(person, createCatalog(), query),
      (e) => e.status === 400,
    );
});
test('NIT checksum accepts K and rejects wrong digits or embedded whitespace', () => {
  assert.equal(nitCheckDigit('1234567'), '9');
  assert.equal(validNit('1234567-9'), true);
  assert.equal(validNit('1234567-8'), false);
  const number = Array.from({ length: 100 }, (_, i) => String(i + 1)).find(
    (n) => nitCheckDigit(n) === 'K',
  );
  assert.equal(validNit(number + '-k'), true);
  assert.equal(validNit('1234 567-9'), false);
});
test('employee code is omitted from create payload and payment confirmation requires reference', () => {
  const employee = table('NOM_EMPLEADO');
  const result = validatePayload(
    employee,
    {
      PER_ID: '1',
      EMP_ID: '1',
      EML_CODIGO: 'MANUAL',
      EML_SALARIO_ORDINARIO_MENSUAL: '5000',
      EML_SALARIO_BONIFICACION_DECRETO: '250',
    },
    { create: true },
  );
  assert.deepEqual(result.errors, {});
  assert.equal(Object.hasOwn(result.data, 'EML_CODIGO'), false);
  const transfer = table('NOM_TRANSFERENCIA_PAGO');
  assert.ok(
    validatePayload(transfer, { TRP_ESTADO: 'CONFIRMADA', TRP_REFERENCIA: '  ' }).errors
      .TRP_REFERENCIA,
  );
  assert.equal(
    validatePayload(transfer, { TRP_ESTADO: 'PENDIENTE', TRP_REFERENCIA: '' }).errors
      .TRP_REFERENCIA,
    undefined,
  );
});
test('record versions preserve precision and reject stale snapshots', () => {
  const t = table('NOM_EMPLEADO'),
    a = { EML_ID: '1', EML_SALARIO_ORDINARIO_MENSUAL: '9007199254740993.01' },
    b = { ...a, EML_SALARIO_ORDINARIO_MENSUAL: '9007199254740993.02' };
  const version = recordVersion(t, a);
  assertVersion(t, a, version);
  assert.throws(
    () => assertVersion(t, b, version),
    (e) => e.code === 'STALE_RECORD',
  );
  assert.equal(recordVersion(t, { ...a, __version: 'ignored' }), version);
});
test('drafts survive storage, are scoped to user, expire and discard independently', () => {
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: (k) => storage[k] ?? null },
    setItem: { value: (k, v) => (storage[k] = v) },
    removeItem: { value: (k) => delete storage[k] },
  });
  const now = Date.now();
  writeDraft(storage, 'ana', 'new', { savedAt: now, values: { name: 'Ana' } });
  writeDraft(storage, 'carlos', 'new', { savedAt: now, values: { name: 'Carlos' } });
  writeDraft(storage, 'ana', 'old', { savedAt: now - 16 * 86400000 });
  storage[draftPrefix('ana') + 'broken'] = '{bad';
  const drafts = readDrafts(storage, 'ana', now);
  assert.equal(drafts.size, 1);
  assert.equal(drafts.get('new').values.name, 'Ana');
  writeDraft(storage, 'ana', 'new', null);
  assert.equal(readDrafts(storage, 'ana', now).size, 0);
  assert.equal(readDrafts(storage, 'carlos', now).size, 1);
});
test('passwords are salted and roles cannot expose payroll to collaborators', async () => {
  const a = await passwordHash('A long password for QA'),
    b = await passwordHash('A long password for QA');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('A long password for QA', a), true);
  assert.equal(await verifyPassword('wrong password', a), false);
  assert.equal(await verifyPassword('x', 'disabled'), false);
  assert.equal(canUseTable(roles.EMPLOYEE, table('NOM_EMPLEADO')), false);
  assert.equal(canUseTable(roles.PAYROLL, table('ERP_EMPRESA'), true), false);
  assert.equal(canOpenPage(roles.EMPLOYEE, 'calendario'), true);
  assert.equal(canOpenPage(roles.EMPLOYEE, 'dashboard'), false);
});
