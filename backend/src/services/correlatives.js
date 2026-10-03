import { executeOptions } from '../config/pool.js';
import { businessRules } from '../../../shared/business-rules.js';
// Serialize allocation on the existing company row, including the first-ever allocation.
// The caller commits the number and employee together, or rolls both back.
export async function employeeCode(c, company) {
  await c.execute('SELECT EMP_ID FROM ERP_EMPRESA WHERE EMP_ID=TO_NUMBER(:company) FOR UPDATE', {
    company,
  });
  let rows = (
    await c.execute(
      "SELECT NCR_ULTIMO,NCR_PREFIJO,NCR_DIGITOS FROM NOM_CORRELATIVO WHERE NCR_TIPO='EMPLEADO' AND NCR_EMPRESA=TO_NUMBER(:company) FOR UPDATE",
      { company },
      executeOptions,
    )
  ).rows;
  if (!rows.length) {
    const prefix = businessRules.employeeCodePrefix;
    // Only parse a numeric suffix. Existing manually assigned identifiers remain intact.
    const old = await c.execute(
      'SELECT NVL(MAX(TO_NUMBER(SUBSTR(EML_CODIGO,LENGTH(:prefix)+1))),0) AS "last" FROM NOM_EMPLEADO WHERE EMP_ID=TO_NUMBER(:company) AND SUBSTR(EML_CODIGO,1,LENGTH(:prefix))=:prefix AND REGEXP_LIKE(SUBSTR(EML_CODIGO,LENGTH(:prefix)+1),\'^[0-9]{1,16}$\')',
      { company, prefix },
      executeOptions,
    );
    rows = [
      {
        NCR_ULTIMO: old.rows[0].last,
        NCR_PREFIJO: prefix,
        NCR_DIGITOS: businessRules.employeeCodeDigits,
      },
    ];
    await c.execute(
      "INSERT INTO NOM_CORRELATIVO (NCR_TIPO,NCR_EMPRESA,NCR_ULTIMO,NCR_PREFIJO,NCR_DIGITOS) VALUES ('EMPLEADO',TO_NUMBER(:company),TO_NUMBER(:last),:prefix,:digits)",
      {
        company,
        last: String(rows[0].NCR_ULTIMO),
        prefix,
        digits: businessRules.employeeCodeDigits,
      },
    );
  }
  const row = rows[0];
  let next = BigInt(row.NCR_ULTIMO),
    code;
  // Changing a prefix must never reuse an existing code.
  do {
    next++;
    code = row.NCR_PREFIJO + String(next).padStart(Number(row.NCR_DIGITOS), '0');
    if (code.length > 20 || String(next).length > 16)
      throw new Error('El correlativo de empleados agotó su longitud configurada.');
  } while (
    (
      await c.execute(
        'SELECT EML_ID FROM NOM_EMPLEADO WHERE EMP_ID=TO_NUMBER(:company) AND EML_CODIGO=:code',
        { company, code },
        executeOptions,
      )
    ).rows.length
  );
  await c.execute(
    "UPDATE NOM_CORRELATIVO SET NCR_ULTIMO=TO_NUMBER(:next) WHERE NCR_TIPO='EMPLEADO' AND NCR_EMPRESA=TO_NUMBER(:company)",
    { next: String(next), company },
  );
  return code;
}
