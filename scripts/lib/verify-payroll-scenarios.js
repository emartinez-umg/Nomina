import assert from 'node:assert/strict';
import request from 'supertest';

// Synthetic accounting examples. Amounts are explicit fixtures, not legal calculations.
export const payrollScenarios = [
  ['Mes completo', '5000', '250', '0', '0', '0', '5250'],
  ['Horas extra diurnas', '5000', '250', '400', '0', '0', '5650'],
  ['Horas extra nocturnas', '5000', '250', '600', '0', '0', '5850'],
  ['Ausencia sin goce', '5000', '250', '0', '200', '0', '5050'],
  ['Vacaciones con goce', '5000', '250', '0', '0', '0', '5250'],
  ['Cuota de préstamo', '5000', '250', '0', '0', '300', '4950'],
  ['Ingreso a mitad de mes', '2500', '125', '0', '0', '0', '2625'],
  ['Extras y ausencia', '5000', '250', '400', '200', '0', '5450'],
  ['Vacaciones y préstamo', '5000', '250', '0', '0', '300', '4950'],
  ['Combinado con centavos', '5000.25', '250', '400.75', '200.15', '300.35', '5150.50'],
];

export async function verifyPayrollScenarios(app) {
  const api = request(app),
    root = '/api/nomina';
  async function post(path, body, status = 201) {
    const r = await api.post(root + path).send(body);
    assert.equal(r.status, status, path + ': ' + JSON.stringify(r.body));
    return r.body;
  }
  const concepts = [];
  for (const [name, type] of [
    ['Ordinario QA', 'INGRESO'],
    ['Bonificación QA', 'INGRESO'],
    ['Extras QA', 'INGRESO'],
    ['Ausencia QA', 'DEDUCCION'],
    ['Préstamo QA', 'DEDUCCION'],
  ])
    concepts.push(await post('/concepto', { NCO_NOMBRE: name, NCO_TIPO: type }));
  const period = await post('/periodo', {
    NPE_TIPO: 'QA_DIEZ_CASOS',
    NPE_ESTADO: 'ABIERTO',
    NPE_ANIO: '2042',
    NPE_MES: '1',
  });
  const payroll = await post('/nomina', {
    EMP_ID: '1',
    NPE_ID: period.NPE_ID,
    NOM_ESTADO: 'BORRADOR',
  });
  const expected = new Map();
  for (const [index, [name, ...amounts]] of payrollScenarios.entries()) {
    const hire = await post('/hr/contrataciones', {
      person: { PER_TIPO: 'F', PER_NOMBRES: 'Caso ' + (index + 1), PER_APELLIDOS: name },
      employee: {
        EMP_ID: '1',
        EML_SALARIO_ORDINARIO_MENSUAL: '5000',
        EML_SALARIO_BONIFICACION_DECRETO: '250',
      },
      relation: {
        PUE_ID: '1',
        SUC_ID: '1',
        DPT_ID: '1',
        USU_ID_CREA: '1',
        RLA_FECHA_INGRESO: index === 6 ? '2042-01-16' : '2042-01-01',
      },
    });
    const detail = await post('/nomina-detalle', {
      NOM_ID: payroll.NOM_ID,
      RLA_ID: hire.relation.RLA_ID,
      NOD_INGRESOS: '0',
      NOD_DEDUCCIONES: '0',
      NOD_LIQUIDO: '0',
    });
    expected.set(detail.NOD_ID, Number(amounts[5]));
    for (let i = 0; i < 5; i++)
      if (Number(amounts[i]))
        await post('/nomina-concepto', {
          NOD_ID: detail.NOD_ID,
          NCO_ID: concepts[i].NCO_ID,
          NDC_MONTO: amounts[i],
        });
  }
  await post(
    '/hr/planilla/' + payroll.NOM_ID,
    { action: 'CONCILIAR', reason: 'Diez ejemplos sintéticos de conciliación' },
    200,
  );
  const review = await api.get(root + '/hr/planilla/' + payroll.NOM_ID);
  assert.equal(review.status, 200, JSON.stringify(review.body));
  assert.equal(review.body.details.length, 10);
  assert.equal(review.body.balanced, true);
  for (const d of review.body.details) assert.equal(Number(d.NOD_LIQUIDO), expected.get(d.NOD_ID));
  console.log(
    'OK: diez empleados con importes sintéticos de ordinario, bonificación, extras, ausencias, vacaciones, préstamo e ingreso parcial; conciliación decimal. No certifica reglas legales.',
  );
}
