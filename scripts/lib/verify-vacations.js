import assert from 'node:assert/strict';
import request from 'supertest';
export async function verifyVacations(app) {
  const api = request(app),
    root = '/api/nomina';
  async function call(method, path, body, status = 200) {
    let req = api[method](root + path);
    if (body) req = req.send(body);
    const r = await req;
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.body)}`);
    return r.body;
  }
  const get = (path) => call('get', path),
    post = (path, body, status = 201) => call('post', path, body, status);
  const department = await post('/erp-departamento', {
    EMP_ID: '1',
    DPT_CODIGO: 'VAC-OTHER',
    DPT_NOMBRE: 'Otro departamento de prueba',
  });
  const jornada = await post('/jornada', {
    EMP_ID: '1',
    JOR_NOMBRE: 'Lunes a viernes — vacaciones de prueba',
  });
  const days = [];
  for (const day of ['1', '2', '3', '4', '5', '6', '7'])
    days.push(
      await post('/jornada-detalle', {
        JOR_ID: jornada.JOR_ID,
        JOD_DIA_SEMANA: day,
        JOD_MINUTOS_ORDINARIOS: Number(day) <= 5 ? '480' : '0',
      }),
    );
  async function hire(code, departmentId = '1', start = '2025-01-01') {
    const h = await post('/hr/contrataciones', {
      person: { PER_TIPO: 'F', PER_NOMBRES: 'Vacaciones', PER_APELLIDOS: code },
      employee: {
        EMP_ID: '1',
        EML_CODIGO: code,
        EML_SALARIO_ORDINARIO_MENSUAL: '5000',
        EML_SALARIO_BONIFICACION_DECRETO: '0',
      },
      relation: {
        PUE_ID: '1',
        SUC_ID: '1',
        DPT_ID: departmentId,
        RLA_FECHA_INGRESO: start,
        USU_ID_CREA: '1',
        TCT_ID: '1',
      },
    });
    await post('/relacion-jornada', {
      RLA_ID: h.relation.RLA_ID,
      JOR_ID: jornada.JOR_ID,
      RLJ_FECHA_DESDE: start,
    });
    return h.employee.EML_ID;
  }
  const main = await hire('VAC-MAIN'),
    same = await hire('VAC-SAME'),
    other = await hire('VAC-OTHER', department.DPT_ID);
  const vacation = (employee, start, end) =>
    post('/vacacion', {
      EML_ID: employee,
      VAC_FECHA_INICIO: start,
      VAC_FECHA_FIN: end,
      VAC_ESTADO: 'SOLICITADA',
    });
  const review = (id) => get('/hr/vacacion/' + id);
  const approve = async (id, status = 200, token) => {
    const c = token || (await review(id)).calculation.reviewToken;
    return post(
      '/hr/vacacion/' + id,
      { action: 'APROBADA', reason: 'Nota de RRHH de prueba', reviewToken: c },
      status,
    );
  };
  const prior = await vacation(main, '2026-01-05', '2026-01-09');
  await approve(prior.VAC_ID);
  await post('/hr/vacacion/' + prior.VAC_ID, { action: 'GOZADA', reason: 'Goce verificado' }, 200);
  const sameVac = await vacation(same, '2026-11-09', '2026-11-10');
  const otherVac = await vacation(other, '2026-11-09', '2026-11-10');
  const example = await vacation(main, '2026-11-07', '2026-11-29');
  const initial = await review(example.VAC_ID);
  assert.equal(initial.calculation.days, 15);
  assert.equal(initial.calculation.months, 22);
  assert.equal(initial.calculation.accrued, '27.50');
  assert.equal(initial.calculation.committed, '5.00');
  assert.equal(initial.calculation.balance, '22.50');
  assert.deepEqual(initial.calculation.errors, []);
  assert.ok(initial.team.some((v) => v.VAC_ID === sameVac.VAC_ID));
  assert.ok(!initial.team.some((v) => v.VAC_ID === otherVac.VAC_ID));
  const reservation = await vacation(main, '2026-12-07', '2026-12-11');
  await approve(reservation.VAC_ID);
  await approve(example.VAC_ID, 422, initial.calculation.reviewToken);
  const refreshed = await review(example.VAC_ID);
  assert.equal(refreshed.calculation.balance, '17.50');
  await approve(example.VAC_ID);
  const stored = await review(example.VAC_ID);
  assert.equal(stored.validation.days, '15');
  assert.equal(stored.validation.balance, '17.5');
  assert.equal(stored.validation.calculation.remaining, '2.50');
  const lowBalance = await vacation(main, '2026-12-14', '2026-12-18');
  const low = await review(lowBalance.VAC_ID);
  assert.equal(low.calculation.balance, '3.75');
  await post(
    '/hr/vacacion/' + lowBalance.VAC_ID,
    {
      action: 'APROBADA',
      reason: 'No debe permitir manipular el saldo',
      reviewToken: low.calculation.reviewToken,
      days: '0',
      balance: '99999',
    },
    422,
  );
  await post(
    '/hr/vacacion/' + reservation.VAC_ID,
    { action: 'ANULADA', reason: 'Solicitud cancelada' },
    200,
  );
  assert.equal((await review(lowBalance.VAC_ID)).calculation.balance, '8.75');
  // Previously approved calculations remain intact if the weekly schedule changes.
  await call('put', '/jornada-detalle/' + days[5].JOD_ID, { JOD_MINUTOS_ORDINARIOS: '480' });
  const afterScheduleChange = await review(example.VAC_ID);
  assert.equal(afterScheduleChange.calculation.days, 19);
  assert.equal(afterScheduleChange.validation.calculation.days, 15);
  assert.equal(afterScheduleChange.validation.calculation.workingDates.length, 15);
  // Two requests cannot spend the same 1.25-day balance concurrently.
  const concurrent = await hire('VAC-CONCURRENT', '1', '2026-10-01');
  const a = await vacation(concurrent, '2026-11-02', '2026-11-02'),
    b = await vacation(concurrent, '2026-11-03', '2026-11-03');
  const ar = await review(a.VAC_ID),
    br = await review(b.VAC_ID);
  assert.equal(ar.calculation.balance, '1.25');
  assert.equal(br.calculation.balance, '1.25');
  const outcomes = await Promise.all(
    [
      [a, ar],
      [b, br],
    ].map(([v, r]) =>
      api.post(root + '/hr/vacacion/' + v.VAC_ID).send({
        action: 'APROBADA',
        reason: 'Prueba concurrente',
        reviewToken: r.calculation.reviewToken,
      }),
    ),
  );
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 422]);
  console.log(
    'OK: ejemplo de 15 días, jornadas con descansos, acumulación, aprobadas y gozadas, reservas, anulaciones, departamentos, cálculo inmutable y aprobación concurrente.',
  );
  return { example: example.VAC_ID, employee: main };
}
