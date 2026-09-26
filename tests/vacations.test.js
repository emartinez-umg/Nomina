import test from 'node:test';
import assert from 'node:assert/strict';
import { completedMonths, serviceAccrual, scheduledVacationDays } from '../shared/vacations.js';
const relations = [{ id: '1', start: '2025-01-05', end: null }];
const schedule = (weekdays = [1, 2, 3, 4, 5], overrides = {}) => ({
  id: '1',
  relationId: '1',
  name: 'Jornada de prueba',
  start: '2025-01-05',
  end: null,
  weekdays,
  ...overrides,
});
test('requested example: November 7–29, 2026 takes exactly 15 Monday–Friday days', () => {
  const c = scheduledVacationDays('2026-11-07', '2026-11-29', relations, [schedule()]);
  assert.equal(c.days, 15);
  assert.deepEqual(c.errors, []);
  assert.equal(c.workingDates[0], '2026-11-09');
  assert.equal(c.workingDates.at(-1), '2026-11-27');
  assert.ok(!c.workingDates.includes('2026-11-07'));
});
test('weekends count only when scheduled and multiple shifts never double-charge a day', () => {
  assert.equal(
    scheduledVacationDays('2026-11-07', '2026-11-29', relations, [schedule([6, 7])]).days,
    8,
  );
  assert.equal(
    scheduledVacationDays('2026-11-07', '2026-11-29', relations, [schedule([1, 2, 3, 4, 5, 6])])
      .days,
    19,
  );
  assert.equal(
    scheduledVacationDays('2026-11-07', '2026-11-29', relations, [
      schedule(),
      schedule(undefined, { id: '2' }),
    ]).days,
    15,
  );
  assert.equal(scheduledVacationDays('2026-11-07', '2026-11-08', relations, [schedule()]).days, 0);
});
test('schedule effective dates and employment boundaries are respected', () => {
  const c = scheduledVacationDays('2026-11-02', '2026-11-08', relations, [
    schedule(undefined, { end: '2026-11-04' }),
    schedule([6, 7], { id: '2', start: '2026-11-05' }),
  ]);
  assert.equal(c.days, 5);
  assert.deepEqual(c.workingDates, [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-07',
    '2026-11-08',
  ]);
  assert.ok(
    scheduledVacationDays('2026-11-02', '2026-11-08', relations, []).errors[0].includes('jornada'),
  );
  assert.ok(
    scheduledVacationDays('2024-11-02', '2024-11-08', relations, [schedule()]).errors[0].includes(
      'contratación',
    ),
  );
  assert.ok(
    scheduledVacationDays('2026-11-02', '2026-11-08', relations, [schedule([])]).errors[0].includes(
      'horarios',
    ),
  );
});
test('monthly accrual starts after a completed month and handles short-month anniversaries', () => {
  assert.equal(completedMonths('2026-01-15', '2026-02-14'), 0);
  assert.equal(completedMonths('2026-01-15', '2026-02-15'), 1);
  assert.equal(completedMonths('2026-01-31', '2026-02-28'), 1);
  assert.equal(completedMonths('2026-01-31', '2026-03-30'), 1);
  assert.equal(completedMonths('2026-01-31', '2026-03-31'), 2);
  assert.equal(completedMonths('2024-01-31', '2024-02-29'), 1);
  assert.equal(serviceAccrual(relations, '2026-01-05').accrued, '15.00');
  assert.equal(serviceAccrual(relations, '2027-01-05').accrued, '30.00');
});
test('overlapping contracts do not multiply accrual; periods without employment do not accrue', () => {
  assert.equal(
    serviceAccrual([...relations, { id: '2', start: '2025-04-01', end: null }], '2026-01-05')
      .accrued,
    '15.00',
  );
  const c = serviceAccrual(
    [
      { start: '2026-01-01', end: '2026-03-01' },
      { start: '2026-05-01', end: null },
    ],
    '2026-07-01',
  );
  assert.equal(c.months, 4);
  assert.equal(c.accrued, '5.00');
});
test('inclusive boundaries count a single working date and reject impossible dates', () => {
  assert.equal(scheduledVacationDays('2026-11-09', '2026-11-09', relations, [schedule()]).days, 1);
  assert.throws(() => completedMonths('2026-02-30', '2026-03-30'), /Fecha no válida/);
  assert.throws(
    () => scheduledVacationDays('2026-11-10', '2026-11-09', relations, [schedule()]),
    /fecha final/,
  );
});
