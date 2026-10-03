import oracledb from 'oracledb';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../backend/src/app.js';
import { createUser } from '../../backend/src/services/auth.js';
import { roles } from '../../shared/access.js';
export async function verifyPending(pool, c) {
  const app = createApp({ pool, authentication: true });
  const root = '/api/nomina',
    password = 'Temporary-test-98765',
    nextPassword = 'Personal-test-98765';
  const users = [];
  for (const [login, role] of [
    ['qa.system', roles.SYSTEM],
    ['qa.payroll', roles.PAYROLL],
    ['qa.employee', roles.EMPLOYEE],
    ['qa.colleague', roles.EMPLOYEE],
  ]) {
    const person = await c.execute(
      "INSERT INTO ERP_PERSONA(PER_TIPO,PER_NOMBRES,PER_APELLIDOS) VALUES('F',:name,'Seguridad QA') RETURNING PER_ID INTO :id",
      { name: login, id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 } },
    );
    const personId = String(person.outBinds.id[0]);
    users.push(await createUser(c, { login, role, personId, companyId: '1', password }));
    if (role === roles.EMPLOYEE)
      await c.execute(
        "INSERT INTO NOM_EMPLEADO(PER_ID,EMP_ID,EML_CODIGO,EML_SALARIO_ORDINARIO_MENSUAL,EML_SALARIO_BONIFICACION_DECRETO) VALUES(TO_NUMBER(:person),'1',:code,5000,250)",
        { person: personId, code: login },
      );
  }
  await c.commit();
  const anonymous = await request(app).get(root + '/empleado');
  assert.equal(anonymous.status, 401);
  const agents = [];
  for (const u of users) {
    const a = request.agent(app);
    let r = await a
      .post(root + '/auth/login')
      .set('X-Nomina-Request', '1')
      .send({ login: u.login, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await a.get(root + '/metadata')).status, 403);
    r = await a
      .post(root + '/auth/password')
      .set('X-Nomina-Request', '1')
      .send({ currentPassword: password, password: nextPassword });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    agents.push(a);
  }
  const [system, hr, employee, colleague] = agents;
  assert.equal((await employee.get(root + '/empleado')).status, 403);
  assert.equal((await employee.get(root + '/hr/dashboard')).status, 403);
  assert.equal((await employee.get(root + '/admin/usuarios')).status, 403);
  assert.equal(
    (
      await hr
        .post(root + '/puesto')
        .set('X-Nomina-Request', '1')
        .send({ PUE_NOMBRE: 'Sin permiso' })
    ).status,
    403,
  );
  assert.equal((await hr.get(root + '/empleado').query({ company: '999999' })).status, 403);
  assert.equal((await hr.get(root + '/empleado').set('X-Nomina-Company', '999999')).status, 403);
  assert.equal(
    (
      await hr
        .post(root + '/erp-persona')
        .send({ PER_TIPO: 'F', PER_NOMBRES: 'CSRF', PER_APELLIDOS: 'Prueba' })
    ).status,
    403,
  );
  const own = await employee.get(root + '/personal/mi-informacion');
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.employees.length, 1);
  assert.equal(own.body.employees[0].EML_CODIGO, 'qa.employee');
  const other = await system
    .post(root + '/erp-empresa')
    .set('X-Nomina-Request', '1')
    .send({ EMP_RAZON_SOCIAL: 'Aislamiento QA', EMP_NIT: '1234567-9' });
  assert.equal(other.status, 201, JSON.stringify(other.body));
  assert.equal((await hr.get(root + '/erp-empresa/' + other.body.EMP_ID)).status, 403);
  assert.equal(
    (await hr.get(root + '/lookups/ERP_EMPRESA').query({ id: other.body.EMP_ID })).status,
    403,
  );
  const person = (await hr.get(root + '/erp-persona/1')).body;
  const edit = await hr
    .put(root + '/erp-persona/1')
    .set('X-Nomina-Request', '1')
    .set('If-Match', person.__version)
    .send({ PER_NOMBRES: 'Ana QA' });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const stale = await hr
    .put(root + '/erp-persona/1')
    .set('X-Nomina-Request', '1')
    .set('If-Match', person.__version)
    .send({ PER_NOMBRES: 'Nombre desactualizado' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'STALE_RECORD');
  assert.equal(
    (
      await hr
        .put(root + '/erp-persona/1')
        .set('X-Nomina-Request', '1')
        .send({ PER_NOMBRES: 'Sin versión' })
    ).status,
    428,
  );
  const hiring = {
    person: { PER_TIPO: 'F', PER_NOMBRES: 'Concurrente', PER_APELLIDOS: 'QA' },
    employee: {
      EMP_ID: '1',
      EML_CODIGO: 'MANUAL-IGNORE',
      EML_SALARIO_ORDINARIO_MENSUAL: '5000',
      EML_SALARIO_BONIFICACION_DECRETO: '250',
    },
    relation: {
      PUE_ID: '1',
      SUC_ID: '1',
      DPT_ID: '1',
      RLA_FECHA_INGRESO: '2026-10-01',
      USU_ID_CREA: '999999',
    },
  };
  const results = await Promise.all(
    [1, 2].map((i) =>
      hr
        .post(root + '/hr/contrataciones')
        .set('X-Nomina-Request', '1')
        .send({ ...hiring, person: { ...hiring.person, PER_NOMBRES: 'Concurrente ' + i } }),
    ),
  );
  for (const r of results) {
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.relation.USU_ID_CREA, users[1].id);
    assert.match(r.body.employee.EML_CODIGO, /^EMP-\d{4,}$/);
  }
  const codes = results
    .map((r) => BigInt(r.body.employee.EML_CODIGO.slice(4)))
    .sort((a, b) => (a < b ? -1 : 1));
  assert.equal(codes[1] - codes[0], 1n);
  const p = await hr
    .post(root + '/periodo')
    .set('X-Nomina-Request', '1')
    .send({
      NPE_TIPO: 'QA_SEGURIDAD',
      NPE_ESTADO: 'ABIERTO',
      NPE_ANIO: '2040',
      NPE_MES: '10',
      NPE_QUINCENA: '1',
    });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal(
    (await hr.delete(root + '/periodo/' + p.body.NPE_ID).set('X-Nomina-Request', '1')).status,
    204,
  );
  const period = await hr
    .post(root + '/periodo')
    .set('X-Nomina-Request', '1')
    .send({
      NPE_TIPO: 'QA_DEPENDENCIA',
      NPE_ESTADO: 'ABIERTO',
      NPE_ANIO: '2040',
      NPE_MES: '12',
      NPE_QUINCENA: '2',
    });
  assert.equal(period.status, 201, JSON.stringify(period.body));
  await c.execute(
    "INSERT INTO NOM_MARCAJE(RLA_ID,NPE_ID,TDI_ID,MRC_FECHA) VALUES(TO_NUMBER(:relation),TO_NUMBER(:period),1,DATE '2040-12-20')",
    { relation: results[0].body.relation.RLA_ID, period: period.body.NPE_ID },
  );
  await c.commit();
  const blockedPeriod = await hr
    .delete(root + '/periodo/' + period.body.NPE_ID)
    .set('X-Nomina-Request', '1');
  assert.equal(blockedPeriod.status, 409, JSON.stringify(blockedPeriod.body));
  assert.equal(blockedPeriod.body.code, 'PERIOD_HAS_DEPENDENCIES');
  const proposed = await hr
    .get(root + '/personal/siguiente-periodo')
    .query({ type: 'QA_DEPENDENCIA', fortnight: '1' });
  assert.deepEqual(proposed.body, { NPE_ANIO: '2041', NPE_MES: '1', NPE_QUINCENA: '1' });
  const marks = await hr
    .get(root + '/marcaje')
    .query({ pending: '1', filterField: 'NPE_ID', filterValue: period.body.NPE_ID });
  assert.equal(marks.status, 200, JSON.stringify(marks.body));
  assert.equal(marks.body.total, 1);
  await c.execute("UPDATE NOM_PERIODO SET NPE_ESTADO='CERRADO' WHERE NPE_ID=TO_NUMBER(:id)", {
    id: period.body.NPE_ID,
  });
  await c.commit();
  assert.equal(
    (await hr.delete(root + '/periodo/' + period.body.NPE_ID).set('X-Nomina-Request', '1')).status,
    204,
  );
  assert.equal((await hr.get(root + '/periodo/' + period.body.NPE_ID)).body.NPE_ESTADO, 'ANULADO');
  const ref = await employee
    .post(root + '/personal/recomendaciones')
    .set('X-Nomina-Request', '1')
    .send({
      name: 'Candidato QA',
      phone: '5555-1234',
      position: '1',
      reason: 'Experiencia comprobable',
    });
  assert.equal(ref.status, 201, JSON.stringify(ref.body));
  const refs = await hr.get(root + '/personal/recomendaciones');
  const row = refs.body.find((r) => r.NRE_NOMBRE === 'Candidato QA');
  assert.ok(row);
  assert.equal(
    (
      await hr
        .put(root + '/personal/recomendaciones/' + row.NRE_ID)
        .set('X-Nomina-Request', '1')
        .send({ state: 'EN_REVISION', note: 'Comentario interno privado' })
    ).status,
    204,
  );
  const visible = (await employee.get(root + '/personal/recomendaciones')).body;
  assert.ok(visible.some((r) => r.NRE_ID === row.NRE_ID));
  assert.ok(visible.every((r) => !Object.hasOwn(r, 'NRE_NOTA')));
  assert.ok(
    (await colleague.get(root + '/personal/recomendaciones')).body.every(
      (r) => r.NRE_ID !== row.NRE_ID,
    ),
  );
  assert.equal(
    (
      await employee
        .put(root + '/personal/recomendaciones/' + row.NRE_ID)
        .set('X-Nomina-Request', '1')
        .send({ state: 'CONTRATADA' })
    ).status,
    403,
  );
  const calendar = await employee
    .get(root + '/personal/calendario')
    .query({ from: '2026-10-01', to: '2026-10-31' });
  assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
  assert.equal(
    (
      await employee
        .get(root + '/personal/calendario')
        .query({ from: '2026-02-29', to: '2026-03-10' })
    ).status,
    422,
  );
  assert.equal(
    (await employee.post(root + '/auth/logout').set('X-Nomina-Request', '1')).status,
    204,
  );
  assert.equal((await employee.get(root + '/personal/mi-informacion')).status, 401);
  console.log(
    'OK: sesiones, cambio obligatorio de contraseña, CSRF, roles, aislamiento de empresa, privacidad del colaborador, versiones, contratación concurrente, correlativos, creador real, períodos, calendario y recomendaciones.',
  );
}
