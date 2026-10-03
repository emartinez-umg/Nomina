import request from 'supertest';
import assert from 'node:assert/strict';
export async function verifyHr(app, c, ids) {
  const api = request(app),
    root = '/api/nomina';
  const count = async (table) => (await c.execute(`SELECT COUNT(*) FROM ${table}`)).rows[0][0];
  const before = await count('ERP_PERSONA');
  const hire = {
    person: { PER_TIPO: 'F', PER_NOMBRES: 'Empleado', PER_APELLIDOS: 'Prueba de alta' },
    email: 'alta@example.invalid',
    phone: '55550100',
    employee: {
      EMP_ID: ids.ERP_EMPRESA[0],
      EML_CODIGO: 'ALTA-TEST',
      EML_SALARIO_ORDINARIO_MENSUAL: '6789.12',
      EML_SALARIO_BONIFICACION_DECRETO: '250',
    },
    relation: {
      PUE_ID: ids.NOM_PUESTO[0],
      SUC_ID: ids.ERP_SUCURSAL[0],
      DPT_ID: ids.ERP_DEPARTAMENTO[0],
      RLA_FECHA_INGRESO: '2026-09-12',
      USU_ID_CREA: ids.ERP_USUARIO[0],
    },
  };
  const invalid = await api
    .post(root + '/hr/contrataciones')
    .send({ ...hire, relation: { ...hire.relation, RLA_FECHA_INGRESO: 'invalid' } });
  assert.equal(invalid.status, 422, JSON.stringify(invalid.body));
  assert.equal(
    await count('ERP_PERSONA'),
    before,
    'failed employment must roll back person and contacts',
  );
  const reportBefore = (await api.get(root + '/hr/dashboard')).body;
  const valid = await api.post(root + '/hr/contrataciones').send(hire);
  assert.equal(valid.status, 201, JSON.stringify(valid.body));
  assert.equal(await count('ERP_PERSONA'), before + 1);
  assert.equal(valid.body.relation.EML_ID, valid.body.employee.EML_ID);
  const e = valid.body.employee,
    p = valid.body.person;
  assert.equal(e.EML_SALARIO_ORDINARIO_MENSUAL, '6789.12');
  const dup = await api
    .post(root + '/hr/contrataciones')
    .send({ personId: p.PER_ID, employee: hire.employee, relation: hire.relation });
  assert.equal(dup.status, 409);
  const email = await api
    .get(root + '/erp-persona-correo')
    .query({ filterField: 'PER_ID', filterValue: p.PER_ID });
  assert.equal(email.body.rows[0].PCO_CORREO, hire.email);
  const dashboard = await api.get(root + '/hr/dashboard');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(Number(dashboard.body.staff.active), Number(reportBefore.staff.active) + 1);
  assert.equal(
    (Number(dashboard.body.staff.monthlySalary) - Number(reportBefore.staff.monthlySalary)).toFixed(
      2,
    ),
    '7039.12',
    'contracts must not multiply salaries',
  );
  const otherCompany = await api
    .post(root + '/erp-empresa')
    .send({ EMP_RAZON_SOCIAL: 'Otra empresa ensayo', EMP_NIT: '1234567-9' });
  assert.equal(otherCompany.status, 201);
  const other = otherCompany.body.EMP_ID;
  const department = await api
    .post(root + '/erp-departamento')
    .send({ EMP_ID: other, DPT_CODIGO: 'OTHER', DPT_NOMBRE: 'Otro departamento' });
  assert.equal(department.status, 201);
  const mismatch = await api
    .put(root + '/relacion-laboral/' + valid.body.relation.RLA_ID)
    .send({ DPT_ID: department.body.DPT_ID });
  assert.equal(mismatch.status, 422);
  assert.ok(mismatch.body.fields.DPT_ID);
  const choices = await api.get(root + '/lookups/ERP_DEPARTAMENTO').query({ filter_EMP_ID: other });
  assert.equal(choices.body.options.length, 1);
  assert.equal(choices.body.options[0].value, department.body.DPT_ID);
  const invalidFilter = await api.get(root + '/lookups/ERP_DEPARTAMENTO?filter_NOT_A_COLUMN=x');
  assert.equal(invalidFilter.status, 400);
  const otherDash = await api.get(root + '/hr/dashboard').query({ company: other });
  assert.equal(otherDash.status, 200);
  assert.equal(otherDash.body.staff.active, '0');
  assert.equal(otherDash.body.staff.monthlySalary, '0');
  assert.equal(otherDash.body.payroll.length, 0);
  const otherList = await api.get(root + '/descuento-aplicado').query({ company: other });
  assert.equal(otherList.body.total, 0);
  // Remove only the successful hire's test records, allowing existing CRUD deletion checks.
  for (const table of ['ERP_PERSONA_CORREO', 'ERP_PERSONA_TELEFONO'])
    await c.execute(`DELETE FROM ${table} WHERE PER_ID=:id`, { id: p.PER_ID });
  await c.execute('DELETE FROM NOM_RELACION_LABORAL WHERE RLA_ID=:id', {
    id: valid.body.relation.RLA_ID,
  });
  await c.execute('DELETE FROM NOM_EMPLEADO WHERE EML_ID=:id', { id: e.EML_ID });
  await c.execute('DELETE FROM ERP_PERSONA WHERE PER_ID=:id', { id: p.PER_ID });
  await c.commit();
  console.log(
    'RRHH: alta atómica, rollback, duplicados, contactos, dashboard y separación entre empresas verificados.',
  );
}
