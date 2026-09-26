import Decimal from 'decimal.js';
export const paymentStates = ['PENDIENTE', 'CONFIRMADA', 'RECHAZADA', 'ANULADA'];
export const stateOptions = (field) =>
  field.name === 'TRP_ESTADO'
    ? paymentStates
    : field.name === 'NCO_TIPO'
      ? ['INGRESO', 'DEDUCCION']
      : field.options;
export function companyScoped(table) {
  return table.fields.some((f) =>
    ['EMP_ID', 'EML_ID', 'RLA_ID', 'NOM_ID', 'NOD_ID', 'LIL_ID', 'NPR_ID', 'JOR_ID'].includes(
      f.name,
    ),
  );
}
export function reconcile(details, concepts) {
  return details.map((d) => {
    const rows = concepts.filter((c) => c.NOD_ID === d.NOD_ID);
    let income = new Decimal(0),
      deductions = new Decimal(0);
    const unknown = rows.some((c) => !['INGRESO', 'DEDUCCION'].includes(c.NCO_TIPO));
    rows.forEach((c) => {
      if (c.NCO_TIPO === 'INGRESO') income = income.plus(c.NDC_MONTO);
      else if (c.NCO_TIPO === 'DEDUCCION') deductions = deductions.plus(c.NDC_MONTO);
    });
    const net = income.minus(deductions);
    return {
      ...d,
      calculatedIncome: income.toFixed(2),
      calculatedDeductions: deductions.toFixed(2),
      calculatedNet: net.toFixed(2),
      conceptCount: rows.length,
      balanced:
        rows.length > 0 &&
        !unknown &&
        income.eq(d.NOD_INGRESOS) &&
        deductions.eq(d.NOD_DEDUCCIONES) &&
        net.eq(d.NOD_LIQUIDO),
    };
  });
}
export function csvCell(value) {
  let text = String(value ?? '');
  // Excel interprets formulas even in quoted cells. Neutralize user controlled cells.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const toCsv = (headers, rows) =>
  '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
