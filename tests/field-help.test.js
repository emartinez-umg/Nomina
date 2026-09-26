import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../shared/schema.json' with { type: 'json' };
import { hintFor, exampleFor, isPhone, validPhone, phoneInput } from '../shared/field-help.js';
import { validatePayload } from '../shared/validation.js';
const tables = [...schema.tables, ...schema.masters];
test('every editable field has an example and safe help, including email', () => {
  for (const t of tables)
    for (const f of t.fields.filter((f) => !f.identity)) {
      assert.ok(exampleFor(f), `${t.name}.${f.name}`);
      assert.ok(hintFor(f), `${t.name}.${f.name}`);
      assert.ok(!hintFor(f).includes('undefined'), f.name);
    }
  const email = tables
    .find((t) => t.name === 'ERP_PERSONA_CORREO')
    .fields.find((f) => f.name === 'PCO_CORREO');
  assert.equal(exampleFor(email), 'correo@dominio.com');
  assert.match(hintFor(email), /correo@dominio.com/);
});
test('all phone fields require eight digits and normalize the example format', () => {
  const phones = tables.flatMap((t) => t.fields.filter(isPhone));
  assert.deepEqual(phones.map((f) => f.name).sort(), ['NCE_TELEFONO', 'PTE_NUMERO']);
  for (const f of phones) {
    const t = { fields: [f], checks: [] };
    for (const v of ['abcdefgh', '1234567', '123456789', '+50212345678', '1234abcd', '1e7'])
      assert.ok(validatePayload(t, { [f.name]: v }).errors[f.name], v);
    for (const v of ['12345678', '1234-5678', '01234567']) {
      const result = validatePayload(t, { [f.name]: v });
      assert.deepEqual(result.errors, {});
      assert.equal(result.data[f.name], v.replace('-', ''));
    }
  }
});
test('phone inputs reject letters and international/overlong pastes without changing the previous number', () => {
  assert.equal(phoneInput('1234a', '1234'), '1234');
  assert.equal(phoneInput('1234-5678'), '12345678');
  assert.equal(phoneInput('+50212345678', '11112222'), '11112222');
  assert.equal(phoneInput('123456789', '12345678'), '12345678');
  assert.equal(phoneInput('01234567'), '01234567');
  assert.equal(phoneInput('', '1234'), '');
  assert.equal(validPhone('1234-5678'), true);
});
