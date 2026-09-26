import assert from 'node:assert/strict';
import request from 'supertest';
export async function verifyWorkflow(app) {
  const root = '/api/nomina',
    api = request(app);
  const call = async (method, path, body, status = 200, headers = {}) => {
    let r = api[method](root + path).set(headers);
    if (body) r = r.send(body);
    r = await r;
    assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const post = (path, body, status = 201) => call('post', path, body, status);
  const get = (path) => call('get', path);
  const e = (await get('/empleado')).rows[0],
    r = (await get('/relacion-laboral')).rows[0];
  assert.ok(e && r);
  const dashboard = await get('/hr/dashboard');
  assert.ok(dashboard.attentionTotal >= 1);
  const pending = await get('/empleado?pending=1');
  assert.ok(pending.rows.some((x) => x.EML_ID === e.EML_ID));
  const bank = await post('/cuenta-bancaria-empleado', {
    EML_ID: e.EML_ID,
    BAN_ID: '1',
    CBE_NUMERO: 'TEST-001',
    CBE_TIPO: 'AHORRO',
  });
  const period = await post('/periodo', {
    NPE_TIPO: 'MENSUAL',
    NPE_ESTADO: 'ABIERTO',
    NPE_ANIO: '2026',
    NPE_MES: '9',
  });
  await post('/nomina', { EMP_ID: e.EMP_ID, NPE_ID: period.NPE_ID, NOM_ESTADO: 'PAGADA' }, 422);
  const n = await post('/nomina', {
      EMP_ID: e.EMP_ID,
      NPE_ID: period.NPE_ID,
      NOM_ESTADO: 'BORRADOR',
    }),
    endpoint = '/hr/planilla/' + n.NOM_ID;
  const action = (action, status = 200) =>
    call('post', endpoint, { action, reason: 'Prueba automatizada: revisión de RRHH.' }, status);
  const d = await post('/nomina-detalle', {
    NOM_ID: n.NOM_ID,
    RLA_ID: r.RLA_ID,
    NOD_INGRESOS: '0',
    NOD_DEDUCCIONES: '0',
    NOD_LIQUIDO: '0',
  });
  await post(
    '/nomina-detalle',
    {
      NOM_ID: n.NOM_ID,
      RLA_ID: r.RLA_ID,
      NOD_INGRESOS: '1',
      NOD_DEDUCCIONES: '0',
      NOD_LIQUIDO: '0',
    },
    422,
  );
  const concept = await post('/nomina-concepto', {
    NOD_ID: d.NOD_ID,
    NCO_ID: '1',
    NDC_MONTO: '5500',
  });
  await action('CALCULADA', 422);
  await action('CONCILIAR');
  let review = await get(endpoint);
  assert.equal(review.details[0].NOD_LIQUIDO, '5500');
  assert.equal(review.balanced, true);
  const kind =
    (await get('/tipo-ingreso')).rows[0] ||
    (await post('/tipo-ingreso', { TIN_NOMBRE: 'Extra de prueba' }));
  const inv = await post('/ingreso-variable', {
    RLA_ID: r.RLA_ID,
    NPE_ID: period.NPE_ID,
    TIN_ID: kind.TIN_ID,
    INV_FECHA: '2026-09-10',
    INV_MONTO: '200',
    INV_ESTADO: 'APROBADA',
  });
  await action('CALCULADA', 422);
  review = await get(endpoint);
  assert.equal(review.pending, 1);
  await call('post', endpoint + '/novedad', {
    key: 'NOM_INGRESO_VARIABLE:' + inv.INV_ID,
    decision: 'INCLUIR',
    reason: 'Ingreso revisado',
    detailId: d.NOD_ID,
    conceptId: '1',
  });
  await call(
    'post',
    endpoint + '/novedad',
    {
      key: 'NOM_INGRESO_VARIABLE:' + inv.INV_ID,
      decision: 'INCLUIR',
      reason: 'Duplicado',
      detailId: d.NOD_ID,
      conceptId: '1',
    },
    422,
  );
  await action('CONCILIAR');
  await action('CALCULADA');
  await call('put', '/nomina-concepto/' + concept.NDC_ID, { NDC_MONTO: '1' }, 422);
  await call('put', '/ingreso-variable/' + inv.INV_ID, { INV_MONTO: '1' }, 422);
  await action('PAGADA', 422);
  const pay = {
    NOD_ID: d.NOD_ID,
    CBE_ID: bank.CBE_ID,
    TRP_FECHA: '2026-09-24',
    TRP_MONTO: '5700',
    TRP_REFERENCIA: 'QA-PAGO-1',
    TRP_ESTADO: 'CONFIRMADA',
  };
  await post('/transferencia-pago', { ...pay, TRP_ESTADO: 'CUALQUIERA' }, 422);
  await post('/transferencia-pago', { ...pay, TRP_MONTO: '5701' }, 422);
  const paid = await post('/transferencia-pago', pay);
  await post('/transferencia-pago', pay, 422);
  await action('PAGADA');
  await call('put', '/nomina/' + n.NOM_ID, { NOM_ESTADO: 'BORRADOR' }, 422);
  await call('put', '/transferencia-pago/' + paid.TRP_ID, { TRP_MONTO: '1' }, 422);
  await call('put', '/periodo/' + period.NPE_ID, { NPE_MES: '10' }, 422);
  await call('put', '/relacion-laboral/' + r.RLA_ID, { EML_ID: '999999' }, 422);
  await call('put', '/cuenta-bancaria-empleado/' + bank.CBE_ID, { CBE_NUMERO: 'CAMBIO' }, 422);
  assert.equal((await get('/ingreso-variable/' + inv.INV_ID)).INV_ESTADO, 'PAGADA');
  const hist = await get('/hr/historial?entity=NOM_NOMINA&id=' + n.NOM_ID);
  assert.ok(hist.rows.some((e) => e.action === 'PAGADA'));
  assert.equal(typeof hist.rows[0].before, 'object');
  const exported = await get('/nomina-detalle/exportar?filterField=NOM_ID&filterValue=' + n.NOM_ID);
  assert.equal(exported.total, 1);
  assert.ok(exported.csv.includes('5700'));
  const filtered = await get(
    '/transferencia-pago?company=' +
      e.EMP_ID +
      '&filter_TRP_ESTADO=CONFIRMADA&dateField=TRP_FECHA&from=2026-09-01&to=2026-09-30',
  );
  assert.equal(filtered.total, 1);
  const lookup = await get('/lookups/NOM_RELACION_LABORAL?company=' + e.EMP_ID);
  assert.ok(lookup.options.some((x) => x.value === r.RLA_ID));
  await call('put', '/empleado/' + e.EML_ID, { EML_SALARIO_ORDINARIO_MENSUAL: '5800' }, 422);
  await call('put', '/empleado/' + e.EML_ID, { EML_SALARIO_ORDINARIO_MENSUAL: '5800' }, 200, {
    'X-Change-Reason': encodeURIComponent('Ajuste anual de prueba'),
    'X-Effective-Date': '2026-09-24',
  });
  const vac = await post('/vacacion', {
    EML_ID: e.EML_ID,
    VAC_FECHA_INICIO: '2026-10-01',
    VAC_FECHA_FIN: '2026-10-05',
    VAC_ESTADO: 'SOLICITADA',
  });
  await post(
    '/vacacion',
    {
      EML_ID: e.EML_ID,
      VAC_FECHA_INICIO: '2026-10-03',
      VAC_FECHA_FIN: '2026-10-07',
      VAC_ESTADO: 'SOLICITADA',
    },
    422,
  );
  await call('put', '/vacacion/' + vac.VAC_ID, { VAC_ESTADO: 'APROBADA' }, 422);
  const vpath = '/hr/vacacion/' + vac.VAC_ID;
  let vacationReview = await get(vpath);
  assert.ok(vacationReview.calculation.errors.some((e) => e.includes('jornada')));
  await call(
    'post',
    vpath,
    { action: 'APROBADA', reason: 'Revisada', reviewToken: vacationReview.calculation.reviewToken },
    422,
  );
  for (const day of ['1', '2', '3', '4', '5'])
    await post('/jornada-detalle', {
      JOR_ID: '1',
      JOD_DIA_SEMANA: day,
      JOD_HORA_ENTRADA: '08:00',
      JOD_HORA_SALIDA: '17:00',
      JOD_MINUTOS_ORDINARIOS: '480',
    });
  await post('/relacion-jornada', {
    RLA_ID: r.RLA_ID,
    JOR_ID: '1',
    RLJ_FECHA_DESDE: r.RLA_FECHA_INGRESO,
  });
  vacationReview = await get(vpath);
  assert.equal(vacationReview.calculation.days, 3);
  assert.equal(vacationReview.calculation.accrued, '10.00');
  await call(
    'post',
    vpath,
    { action: 'APROBADA', reason: 'Revisada', reviewToken: 'obsoleto' },
    422,
  );
  await call('post', vpath, {
    action: 'APROBADA',
    reason: 'Jornada revisada',
    reviewToken: vacationReview.calculation.reviewToken,
    days: '1',
    balance: '9999',
    source: 'Dato manipulado',
  });
  const approvedVacation = await get(vpath);
  assert.equal(approvedVacation.validation.days, '3');
  assert.equal(approvedVacation.validation.balance, '10');
  assert.equal(approvedVacation.validation.calculation.workingDates.length, 3);
  await call('put', '/relacion-laboral/' + r.RLA_ID, { RLA_ESTADO: 'FINALIZADA' }, 422);
  await call('delete', '/empleado/' + e.EML_ID, null, 422);
  const bpath = '/hr/baja/' + r.RLA_ID;
  await get(bpath);
  await call('post', bpath, { date: '2025-01-01', reason: 'Prueba', reviewed: true }, 422);
  await call('post', bpath, {
    date: '2026-09-24',
    reason: 'Cierre de relación de prueba',
    reviewed: true,
  });
  assert.equal((await get('/empleado/' + e.EML_ID)).EML_ACTIVO, '0');
  const liq = await post('/liquidacion-laboral', {
    EML_ID: e.EML_ID,
    RLA_ID: r.RLA_ID,
    LIL_FECHA: '2026-09-24',
    LIL_MONTO: '500',
    LIL_MOTIVO: 'Liquidación de prueba',
  });
  const ld = await post('/liquidacion-detalle', {
    LIL_ID: liq.LIL_ID,
    NCO_ID: '1',
    LLD_MONTO: '500',
  });
  const lpath = '/hr/liquidacion/' + liq.LIL_ID;
  assert.equal((await get(lpath)).balanced, true);
  await call(
    'post',
    lpath,
    { bankId: bank.CBE_ID, date: '2026-09-24', amount: '501', reference: 'QA-LIQ-1' },
    422,
  );
  await call('post', lpath, {
    bankId: bank.CBE_ID,
    date: '2026-09-24',
    amount: '200',
    reference: 'QA-LIQ-1',
  });
  await call('put', '/liquidacion-detalle/' + ld.LLD_ID, { LLD_MONTO: '700' }, 422);
  await call('post', lpath, {
    bankId: bank.CBE_ID,
    date: '2026-09-24',
    amount: '300',
    reference: 'QA-LIQ-2',
  });
  assert.equal((await get(lpath)).pending, '0.00');
  const events = await get('/hr/historial?employee=' + e.EML_ID);
  assert.ok(events.rows.some((x) => x.action === 'BAJA'));
  console.log(
    'OK: planilla, conciliación, novedades, pagos, vacaciones, baja, liquidación, historial, exportación, filtros y protección de estados.',
  );
  return { payroll: n.NOM_ID, employee: e.EML_ID, vacation: vac.VAC_ID, liquidation: liq.LIL_ID };
}
