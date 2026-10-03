import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import schema from '../../../shared/schema.json';
import { toCsv } from '../../../shared/workflow.js';
import { Button } from '../components/ui/button';
import { ForeignKeySelect } from '../components/ForeignKeySelect';
import { amount } from './Dashboard';
const names = {
  planilla: 'Revisar planilla',
  vacacion: 'Revisar vacaciones',
  baja: 'Registrar baja',
  liquidacion: 'Liquidación y pagos',
  historial: 'Historial de cambios',
};
const sourceNames = {
  NOM_INGRESO_VARIABLE: 'Ingreso variable',
  NOM_DESCUENTO_APLICADO: 'Descuento',
  NOM_PRESTAMO_CUOTA: 'Cuota de préstamo',
  NOM_MARCAJE: 'Marcaje',
  NOM_MOVIMIENTO: 'Movimiento',
  NOM_AUSENCIA: 'Ausencia',
  NOM_VACACION: 'Vacaciones',
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const all = [...schema.tables, ...schema.masters];
const label = (key) =>
  all.flatMap((t) => t.fields).find((f) => f.name === key)?.label ||
  {
    amount: 'Monto',
    reference: 'Referencia',
    date: 'Fecha',
    bank: 'Cuenta',
    days: 'Días',
    balance: 'Saldo verificado',
    source: 'Fuente del saldo',
    decision: 'Decisión',
    key: 'Novedad',
  }[key] ||
  key;
function download(name, headers, rows) {
  const url = URL.createObjectURL(
      new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WorkflowPage({ api, go }) {
  const params = new URLSearchParams(location.search),
    kind = params.get('tipo'),
    id = params.get('id');
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [reason, setReason] = useState('');
  useEffect(() => {
    const c = new AbortController();
    setError('');
    setData(null);
    const path =
      kind === 'historial'
        ? '/hr/historial?' +
          new URLSearchParams(
            params.get('empleado')
              ? { employee: params.get('empleado'), page }
              : { entity: params.get('entidad'), id, page },
          )
        : `/hr/${kind}/${id}`;
    api(path, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [api, kind, id, revision, page]);
  async function act(body, suffix = '') {
    setBusy(true);
    setError('');
    try {
      await api(`/hr/${kind}/${id}${suffix}`, {
        method: 'POST',
        body: JSON.stringify({ ...body, reason: body.reason || reason }),
      });
      toast.success('Revisión guardada.');
      setRevision((v) => v + 1);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workflow-stack">
      <div className="flex flex-wrap gap-3 no-print">
        <Button
          variant="outline"
          onClick={() =>
            go(
              {
                planilla: 'nomina',
                vacacion: 'vacacion',
                baja: 'relacion-laboral',
                liquidacion: 'liquidacion-laboral',
              }[kind] || 'empleado',
            )
          }
        >
          Volver al listado
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          Actualizar revisión
        </Button>
      </div>
      <section className="hr-card">
        <h2>{names[kind] || 'Revisión'}</h2>
        <p className="text-sm text-muted-foreground">
          Las decisiones se guardan con fecha, motivo y el usuario de la sesión.
        </p>
      </section>
      {error && (
        <div role="alert" className="hr-card text-destructive">
          {error}
          <Button variant="outline" className="ml-3" onClick={() => setRevision((v) => v + 1)}>
            Reintentar carga
          </Button>
        </div>
      )}
      {!data && !error && (
        <p role="status" className="hr-card">
          Cargando revisión…
        </p>
      )}
      {data && (
        <>
          {kind === 'planilla' && (
            <Payroll
              data={data}
              go={go}
              act={act}
              busy={busy}
              api={api}
              reason={reason}
              setReason={setReason}
            />
          )}
          {kind === 'vacacion' && (
            <Vacation
              data={data}
              act={act}
              busy={busy}
              reason={reason}
              setReason={setReason}
              go={go}
            />
          )}
          {kind === 'baja' && (
            <Termination
              data={data}
              act={act}
              busy={busy}
              reason={reason}
              setReason={setReason}
              go={go}
            />
          )}
          {kind === 'liquidacion' && (
            <Liquidation data={data} act={act} busy={busy} api={api} go={go} />
          )}
          {kind === 'historial' && <History data={data} page={page} setPage={setPage} />}
          {kind !== 'historial' && (
            <Button
              variant="outline"
              className="no-print"
              onClick={() =>
                go('revision', {
                  tipo: 'historial',
                  entidad: {
                    planilla: 'NOM_NOMINA',
                    vacacion: 'NOM_VACACION',
                    baja: 'NOM_RELACION_LABORAL',
                    liquidacion: 'NOM_LIQUIDACION_LABORAL',
                  }[kind],
                  id,
                })
              }
            >
              Ver historial de esta gestión
            </Button>
          )}
        </>
      )}
    </div>
  );
}
function Reason({ value, onChange }) {
  return (
    <label className="block mt-4 no-print">
      Motivo de la decisión *
      <textarea
        className="control w-full mt-2"
        rows={2}
        value={value}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Explica qué revisaste y por qué procede esta acción."
      />
    </label>
  );
}
function Payroll({ data: d, go, act, busy, api, reason, setReason }) {
  const [slips, setSlips] = useState(false);
  const draft = d.payroll.NOM_ESTADO === 'BORRADOR';
  if (slips)
    return (
      <section className="hr-card">
        <div className="workflow-actions">
          <Button variant="outline" onClick={() => setSlips(false)}>
            Volver a la revisión
          </Button>
          <Button onClick={() => window.print()}>Imprimir o guardar PDF</Button>
        </div>
        {d.details.map((row) => (
          <article className="print-slip py-6" key={row.NOD_ID}>
            <h2>Resumen de remuneración · {row.employee}</h2>
            <p>
              Empleado: {row.EML_CODIGO} · Planilla {d.payroll.NOM_ID} · {d.start} al {d.end}
            </p>
            <p>
              Estado: {d.payroll.NOM_ESTADO} ·{' '}
              {d.payroll.NOM_ESTADO === 'PAGADA'
                ? 'Pago registrado'
                : 'Documento de revisión; no acredita pago'}
            </p>
            <table className="workflow-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {d.concepts
                  .filter((c) => c.NOD_ID === row.NOD_ID)
                  .map((c) => (
                    <tr key={c.NDC_ID}>
                      <td>{c.NCO_NOMBRE}</td>
                      <td>{c.NCO_TIPO}</td>
                      <td>{amount(c.NDC_MONTO)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-4">
              Ingresos: {amount(row.NOD_INGRESOS)} · Deducciones: {amount(row.NOD_DEDUCCIONES)} ·
              Líquido: <strong>{amount(row.NOD_LIQUIDO)}</strong>
            </p>
            <p>Pagos confirmados: {amount(row.paid)}</p>
          </article>
        ))}
      </section>
    );
  return (
    <>
      <section className="hr-card">
        <div className="section-heading">
          <h2>Planilla {d.payroll.NOM_ID}</h2>
          <span className="status">{d.payroll.NOM_ESTADO}</span>
        </div>
        <p>
          {d.start} al {d.end} · {d.details.length} relaciones laborales · {d.pending} novedades
          pendientes de revisión
        </p>
        <p className="notice mt-4">
          1. Registra los empleados y sus conceptos. 2. Revisa las novedades del período. 3.
          Concilia y marca como calculada. 4. Registra los pagos y verifica el cierre.
        </p>
        <div className="workflow-actions">
          <Button
            variant="outline"
            onClick={() =>
              go('nomina-detalle', { filterField: 'NOM_ID', filterValue: d.payroll.NOM_ID })
            }
          >
            Empleados y conceptos
          </Button>
          <Button
            variant="outline"
            disabled={!d.details.length}
            onClick={() =>
              download(
                `planilla-${d.payroll.NOM_ID}.csv`,
                [
                  'Empleado',
                  'Código',
                  'Ingresos',
                  'Deducciones',
                  'Líquido',
                  'Pagos confirmados',
                  'Conciliado',
                ],
                d.details.map((r) => [
                  r.employee,
                  r.EML_CODIGO,
                  r.NOD_INGRESOS,
                  r.NOD_DEDUCCIONES,
                  r.NOD_LIQUIDO,
                  r.paid,
                  r.balanced ? 'Sí' : 'No',
                ]),
              )
            }
          >
            Exportar planilla
          </Button>
          <Button variant="outline" disabled={!d.details.length} onClick={() => setSlips(true)}>
            Resúmenes individuales
          </Button>
        </div>
      </section>
      <section className="hr-card">
        <h2>Conceptos y pagos por empleado</h2>
        <p className="mb-4 text-sm">
          {d.balanced
            ? 'Los totales coinciden con los conceptos.'
            : 'Hay detalles sin conceptos o diferencias por conciliar.'}
        </p>
        <div className="overflow-x-auto">
          <table className="workflow-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Ingresos / deducciones</th>
                <th>Líquido registrado / por conceptos</th>
                <th>Pagado</th>
                <th>Revisión</th>
              </tr>
            </thead>
            <tbody>
              {d.details.map((r) => (
                <tr key={r.NOD_ID}>
                  <td>
                    {r.employee}
                    <small className="block">{r.EML_CODIGO}</small>
                  </td>
                  <td>
                    {amount(r.NOD_INGRESOS)} / {amount(r.NOD_DEDUCCIONES)}
                  </td>
                  <td>
                    {amount(r.NOD_LIQUIDO)} / {amount(r.calculatedNet)}
                  </td>
                  <td>{amount(r.paid)}</td>
                  <td>
                    <span className={`status ${r.balanced ? 'positive' : 'pending'}`}>
                      {r.balanced ? 'Conciliado' : r.conceptCount ? 'Diferencia' : 'Sin conceptos'}
                    </span>
                    <div className="workflow-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          go('nomina-concepto', { filterField: 'NOD_ID', filterValue: r.NOD_ID })
                        }
                      >
                        Conceptos
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          go('transferencia-pago', { filterField: 'NOD_ID', filterValue: r.NOD_ID })
                        }
                      >
                        Pagos
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!d.details.length && (
          <p className="notice">Agrega los empleados de esta planilla para comenzar.</p>
        )}
      </section>
      <section className="hr-card">
        <h2>Novedades del período</h2>
        <p className="text-sm mb-4">
          Los importes se incluyen una vez y quedan vinculados al concepto. Para marcajes, ausencias
          y movimientos, documenta el efecto revisado; el sistema no calcula tasas ni prestaciones
          automáticamente.
        </p>
        {!d.sources.length ? (
          <p>No hay novedades registradas para este período y empresa.</p>
        ) : (
          d.sources.map((s) => (
            <Source
              key={s.key}
              source={s}
              details={d.details}
              act={act}
              busy={busy || !draft}
              api={api}
            />
          ))
        )}
      </section>
      <section className="hr-card">
        <h2>
          {['PAGADA', 'ANULADA'].includes(d.payroll.NOM_ESTADO)
            ? 'Proceso terminado'
            : 'Continuar el proceso'}
        </h2>
        {['BORRADOR', 'CALCULADA'].includes(d.payroll.NOM_ESTADO) && (
          <Reason value={reason} onChange={setReason} />
        )}
        <div className="workflow-actions">
          {draft && (
            <>
              <Button
                disabled={busy || !reason.trim() || !d.details.length}
                onClick={() => act({ action: 'CONCILIAR' })}
              >
                Conciliar totales con conceptos
              </Button>
              <Button
                disabled={busy || !reason.trim() || !d.balanced || !!d.pending}
                onClick={() => act({ action: 'CALCULADA' })}
              >
                Marcar calculada
              </Button>
            </>
          )}
          {d.payroll.NOM_ESTADO === 'CALCULADA' && (
            <>
              <Button
                disabled={busy || !reason.trim() || !d.fullyPaid || !!d.pending || !d.balanced}
                onClick={() => act({ action: 'PAGADA' })}
              >
                Cerrar como pagada
              </Button>
              <Button
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() => act({ action: 'BORRADOR' })}
              >
                Reabrir borrador
              </Button>
            </>
          )}
          {['BORRADOR', 'CALCULADA'].includes(d.payroll.NOM_ESTADO) && (
            <Button
              variant="outline"
              disabled={busy || !reason.trim()}
              onClick={() => {
                if (window.confirm('¿Anular esta planilla? La decisión conservará su historial.'))
                  act({ action: 'ANULADA' });
              }}
            >
              Anular planilla
            </Button>
          )}
        </div>
        {d.payroll.NOM_ESTADO === 'CALCULADA' && !d.fullyPaid && (
          <p className="notice mt-3">
            Faltan pagos confirmados para cubrir el líquido de cada empleado.
          </p>
        )}
        {['PAGADA', 'ANULADA'].includes(d.payroll.NOM_ESTADO) && (
          <p className="notice mt-3">La planilla conserva su información y no admite cambios.</p>
        )}
      </section>
    </>
  );
}
function Source({ source: s, details, act, busy, api }) {
  const candidates = details.filter(
    (d) => d.EML_ID === s.employeeId && (!s.relationId || s.relationId === d.RLA_ID),
  );
  const [decision, setDecision] = useState(s.kind === 'REVISION' ? 'REVISADO' : 'INCLUIR'),
    [reason, setReason] = useState(''),
    [detailId, setDetailId] = useState(candidates.length === 1 ? candidates[0].NOD_ID : ''),
    [conceptId, setConceptId] = useState('');
  return (
    <details className="rounded-lg border p-4 mb-3">
      <summary className="cursor-pointer font-semibold">
        {sourceNames[s.table]} #{s.id} · {s.employee}
        {s.amount ? ` · ${amount(s.amount)}` : ''}{' '}
        <span className={`status ${s.current ? 'positive' : 'pending'}`}>
          {s.current ? s.review.RHR_DECISION : s.review ? 'Revisar: cambió el origen' : 'Pendiente'}
        </span>
      </summary>
      <div className="mt-3">
        <dl className="review-grid">
          {Object.entries(s.fields)
            .filter(([k, v]) => !k.endsWith('_ID') && v !== null)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{label(k)}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
        </dl>
        {s.review ? (
          <>
            <p className="mt-3">Motivo: {s.review.RHR_MOTIVO}</p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={busy}
              onClick={() =>
                act(
                  {
                    key: s.key,
                    decision: 'DESHACER',
                    reason: 'Se deshace la revisión para corregirla.',
                  },
                  '/novedad',
                )
              }
            >
              Deshacer revisión y concepto vinculado
            </Button>
          </>
        ) : (
          <>
            <div className="workflow-fields">
              <label>
                Decisión
                <select
                  className="control"
                  value={decision}
                  disabled={busy}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  {s.kind === 'REVISION' ? (
                    <option value="REVISADO">Revisado manualmente</option>
                  ) : (
                    <option value="INCLUIR">Incluir importe en planilla</option>
                  )}
                  <option value="EXCLUIR">Excluir con motivo</option>
                </select>
              </label>
              {decision === 'INCLUIR' && (
                <>
                  <label>
                    Detalle del empleado
                    <select
                      className="control"
                      value={detailId}
                      disabled={busy}
                      onChange={(e) => setDetailId(e.target.value)}
                    >
                      <option value="">Selecciona el detalle</option>
                      {candidates.map((d) => (
                        <option key={d.NOD_ID} value={d.NOD_ID}>
                          {d.employee} · relación {d.RLA_ID}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Concepto
                    <ForeignKeySelect
                      field={{ label: 'Concepto', ref: { table: 'NOM_CONCEPTO' }, required: true }}
                      value={conceptId}
                      onChange={setConceptId}
                      disabled={busy}
                      filters={{ NCO_TIPO: s.kind }}
                      api={api}
                    />
                  </label>
                </>
              )}
            </div>
            <Reason value={reason} onChange={setReason} />
            <Button
              className="mt-3"
              disabled={
                busy || !reason.trim() || (decision === 'INCLUIR' && (!detailId || !conceptId))
              }
              onClick={() => act({ key: s.key, decision, reason, detailId, conceptId }, '/novedad')}
            >
              Guardar revisión
            </Button>
          </>
        )}
      </div>
    </details>
  );
}
function Vacation({ data: d, act, busy, reason, setReason, go }) {
  const v = d.vacation,
    c = d.validation?.calculation || d.calculation;
  const legacy = !!d.validation && !d.validation.calculation;
  const days = legacy ? Number(d.validation.days) : c.days;
  const balance = legacy ? d.validation.balance : c.balance;
  const remaining = legacy ? amount(Number(balance) - days) : c.remaining;
  const dateText = (value) => (value ? value.split('-').reverse().join('/') : '—');
  const weekdayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const canApprove =
    c.errors.length === 0 && c.days > 0 && Number(c.balance) >= c.days && !d.conflicts.length;
  return (
    <>
      <section className="hr-card">
        <h2>
          Solicitud {v.VAC_ID} · {v.VAC_ESTADO}
        </h2>
        <p className="mt-2">
          Del {dateText(v.VAC_FECHA_INICIO)} al {dateText(v.VAC_FECHA_FIN)} ·{' '}
          <strong>
            {legacy || c.dayCountReady
              ? `${days} días laborales de vacaciones`
              : 'Conteo pendiente: completa la jornada'}
          </strong>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Se cuentan únicamente los días de trabajo de la jornada vigente, incluidos sábados o
          domingos cuando corresponda.
        </p>
        <div className="workflow-actions">
          <Button variant="outline" onClick={() => go('expediente', { empleado: v.EML_ID })}>
            Ver expediente del empleado
          </Button>
        </div>
        {legacy && (
          <p className="notice mt-4">
            Esta solicitud conserva los días y el saldo de su aprobación anterior. El cálculo
            automático se aplica a las nuevas aprobaciones.
          </p>
        )}
        {!legacy && (
          <>
            {c.schedules.map((s) => (
              <p className="mt-3 text-sm" key={s.id}>
                <strong>{s.name}:</strong> {s.weekdays.map((w) => weekdayNames[w - 1]).join(', ')} ·
                Desde {dateText(s.start)}
                {s.end ? ` hasta ${dateText(s.end)}` : ''}
              </p>
            ))}
            {c.dayCountReady && c.workingDates.length > 0 && (
              <details className="mt-4 rounded-lg border p-4">
                <summary className="cursor-pointer font-semibold">
                  Ver los {c.days} días que se descontarán
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.workingDates.map((date) => (
                    <span className="status muted" key={date}>
                      {dateText(date)}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>
      <section className="hr-card">
        <h2>Cruces con el empleado y su departamento</h2>
        {d.conflicts.length ? (
          <div role="alert" className="notice mt-3">
            Hay {d.conflicts.length} cruces con vacaciones o ausencias del mismo empleado.
            {d.conflicts.map((x, i) => (
              <p key={i}>
                {x.type}: {dateText(x.start)} al {dateText(x.end)}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-2">Sin cruces con otras vacaciones o ausencias de este empleado.</p>
        )}
        <h3 className="font-semibold mt-4">Vacaciones del mismo departamento</h3>
        <p className="text-sm text-muted-foreground">
          {d.calculation.departments.length
            ? d.calculation.departments.join(' · ')
            : 'El empleado no tiene departamento asignado para estas fechas; no se puede comprobar la cobertura del equipo.'}
        </p>
        {d.team.length
          ? d.team.map((t) => (
              <p className="mt-2" key={t.VAC_ID}>
                {t.employee} · {dateText(t.start)} al {dateText(t.end)} · {t.VAC_ESTADO}
              </p>
            ))
          : d.calculation.departments.length > 0 && (
              <p className="mt-2">
                No hay otras solicitudes del mismo departamento que coincidan con estas fechas.
              </p>
            )}
      </section>
      <section className="hr-card">
        <h2>{v.VAC_ESTADO === 'SOLICITADA' ? 'Registrar decisión' : 'Decisión registrada'}</h2>
        {v.VAC_ESTADO === 'SOLICITADA' && (
          <p className="notice mt-3">
            Los días, las fechas y el saldo ya están calculados. Para aprobar, escribe únicamente la
            nota de RR. HH.
          </p>
        )}
        {!legacy &&
          c.errors.map((message) => (
            <p role="alert" className="notice mt-3" key={message}>
              {message}
            </p>
          ))}
        <div className="workflow-fields">
          <label>
            Inicio de vacaciones
            <input className="control" readOnly value={dateText(v.VAC_FECHA_INICIO)} />
          </label>
          <label>
            Fin de vacaciones
            <input className="control" readOnly value={dateText(v.VAC_FECHA_FIN)} />
          </label>
          <label>
            Días laborales de vacaciones
            <input
              className="control"
              readOnly
              value={legacy || c.dayCountReady ? String(days) : 'Pendiente de jornada'}
            />
          </label>
          <label>
            Saldo disponible antes de esta solicitud
            <input
              className="control"
              readOnly
              value={balance === null ? 'Pendiente de cálculo' : `${amount(balance)} días`}
            />
          </label>
          <label>
            Saldo después de esta solicitud
            <input
              className="control"
              readOnly
              value={remaining === null ? 'Pendiente de cálculo' : `${amount(remaining)} días`}
            />
          </label>
        </div>
        {!legacy && (
          <>
            <p className="text-sm">
              Contratación: <strong>{dateText(c.hireDate)}</strong>. Saldo al{' '}
              <strong>{dateText(c.cutoff)}</strong> (inicio de vacaciones).
            </p>
            <p className="mt-2 text-sm">
              {c.months} meses completos × 1.25 días ={' '}
              <strong>{amount(c.accrued)} días acumulados</strong> − {amount(c.committed)} días
              previamente aprobados o gozados.
            </p>
            {c.deductions.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold">
                  Vacaciones anteriores y reservas descontadas del saldo ({c.deductions.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {c.deductions.map((x) => (
                    <p key={x.id}>
                      Solicitud {x.id}: {dateText(x.start)} al {dateText(x.end)} ·{' '}
                      {x.days === null ? 'Conteo pendiente' : `${amount(x.days)} días`} · {x.state}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        {v.VAC_ESTADO === 'SOLICITADA' && c.balance !== null && Number(c.balance) < c.days && (
          <p role="alert" className="notice mt-4">
            Saldo insuficiente: hay {amount(c.balance)} días disponibles y la solicitud requiere{' '}
            {c.days}.
          </p>
        )}
        {v.VAC_ESTADO === 'SOLICITADA' && c.dayCountReady && c.days === 0 && (
          <p className="notice mt-4">
            Este rango no incluye días laborales. Ajusta las fechas de la solicitud.
          </p>
        )}
        {['SOLICITADA', 'APROBADA'].includes(v.VAC_ESTADO) && (
          <label className="block mt-4">
            Nota de RR. HH. *
            <textarea
              className="control w-full mt-2"
              rows={3}
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Escribe la nota de la decisión."
            />
          </label>
        )}
        {v.VAC_ESTADO === 'APROBADA' && v.VAC_FECHA_FIN > today() && (
          <p className="notice mt-3">Podrás registrar el goce al finalizar el período aprobado.</p>
        )}
        <div className="workflow-actions">
          {v.VAC_ESTADO === 'SOLICITADA' && (
            <Button
              disabled={busy || !reason.trim() || !canApprove}
              onClick={() => act({ action: 'APROBADA', reviewToken: d.calculation.reviewToken })}
            >
              {busy ? 'Guardando…' : 'Aprobar solicitud'}
            </Button>
          )}
          {v.VAC_ESTADO === 'APROBADA' && (
            <Button
              disabled={busy || !reason.trim() || v.VAC_FECHA_FIN > today()}
              onClick={() => act({ action: 'GOZADA' })}
            >
              Registrar como gozadas
            </Button>
          )}
          {['SOLICITADA', 'APROBADA'].includes(v.VAC_ESTADO) && (
            <Button
              variant="outline"
              disabled={busy || !reason.trim()}
              onClick={() => act({ action: 'ANULADA' })}
            >
              Anular solicitud
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
function Termination({ data: d, act, busy, reason, setReason, go }) {
  const [date, setDate] = useState(today()),
    [reviewed, setReviewed] = useState(false),
    r = d.relation;
  return (
    <>
      <section className="hr-card">
        <h2>
          Relación laboral {r.RLA_ID} · {r.RLA_ESTADO}
        </h2>
        <p>
          Ingreso: {r.RLA_FECHA_INGRESO} · Empleado {d.employee.EML_CODIGO}
        </p>
        <div className="workflow-actions">
          <Button variant="outline" onClick={() => go('expediente', { empleado: r.EML_ID })}>
            Revisar expediente y gestiones pendientes
          </Button>
          <Button
            variant="outline"
            onClick={() => go('prestamo', { filterField: 'EML_ID', filterValue: r.EML_ID })}
          >
            Revisar préstamos ({d.loans.length})
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              go('liquidacion-laboral', {
                filterField: 'RLA_ID',
                filterValue: r.RLA_ID,
                EML_ID: r.EML_ID,
              })
            }
          >
            Liquidaciones ({d.liquidations.length})
          </Button>
        </div>
      </section>
      {r.RLA_ESTADO === 'FINALIZADA' ? (
        <section className="hr-card">
          <h2>Baja registrada</h2>
          <p>
            {r.RLA_FECHA_BAJA} · {r.RLA_MOTIVO_BAJA}
          </p>
          <p className="mt-3">Continúa con la revisión de la liquidación y su pago.</p>
          <Button
            className="mt-3"
            onClick={() =>
              go('liquidacion-laboral', { nuevo: '1', EML_ID: r.EML_ID, RLA_ID: r.RLA_ID })
            }
          >
            Registrar liquidación
          </Button>
        </section>
      ) : (
        <section className="hr-card">
          <h2>Finalizar relación laboral</h2>
          <p className="notice">
            Se registrará la fecha y el motivo. El empleado quedará inactivo solo si no conserva
            otras relaciones activas o suspendidas. La liquidación se revisa por separado con sus
            importes verificados.
          </p>
          <label>
            Fecha de baja *
            <input
              className="control ml-3"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <Reason value={reason} onChange={setReason} />
          <label className="flex gap-2 mt-4">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            Revisé préstamos, vacaciones, ausencias y pagos pendientes del expediente.
          </label>
          <Button
            className="mt-4"
            disabled={busy || !reason.trim() || !date || !reviewed}
            onClick={() => {
              if (
                window.confirm(
                  '¿Confirmar la baja y actualizar el estado del empleado cuando corresponda?',
                )
              )
                act({ date, reviewed });
            }}
          >
            Confirmar baja
          </Button>
        </section>
      )}
    </>
  );
}
function Liquidation({ data: d, act, busy, api, go }) {
  const [bankId, setBankId] = useState(''),
    [date, setDate] = useState(today()),
    [value, setValue] = useState(''),
    [reference, setReference] = useState(''),
    [state, setState] = useState('PENDIENTE');
  const l = d.liquidation;
  return (
    <>
      <section className="hr-card">
        <h2>Liquidación {l.LIL_ID}</h2>
        <p>
          Monto registrado: {amount(l.LIL_MONTO)} · Por conceptos: {amount(d.total)} · Pagado:{' '}
          {amount(d.paid)} · Pendiente: {amount(d.pending)}
        </p>
        <p className="notice mt-3">
          {d.balanced
            ? 'Los conceptos coinciden con el monto a pagar.'
            : 'Revisa los conceptos: deben coincidir con el total antes de registrar pagos.'}{' '}
          Los importes deben venir del cálculo verificado de RR. HH.
        </p>
        <Button
          variant="outline"
          onClick={() =>
            go('liquidacion-detalle', { filterField: 'LIL_ID', filterValue: l.LIL_ID })
          }
        >
          Revisar conceptos de liquidación
        </Button>
      </section>
      <section className="hr-card">
        <h2>Pagos de esta liquidación</h2>
        {d.payments.length ? (
          <table className="workflow-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {d.payments.map((p) => (
                <tr key={p.RPL_ID}>
                  <td>{p.RPL_FECHA}</td>
                  <td>{p.RPL_REFERENCIA}</td>
                  <td>{amount(p.RPL_MONTO)}</td>
                  <td>{p.RPL_ESTADO}</td>
                  <td>
                    {['PENDIENTE', 'RECHAZADA'].includes(p.RPL_ESTADO) && (
                      <select
                        className="control"
                        aria-label={'Estado del pago ' + p.RPL_ID}
                        value={p.RPL_ESTADO}
                        disabled={busy}
                        onChange={(e) => {
                          const state = e.target.value;
                          const reference =
                            state === 'CONFIRMADA'
                              ? window.prompt(
                                  'Referencia bancaria obligatoria:',
                                  p.RPL_REFERENCIA || '',
                                )
                              : undefined;
                          if (state !== 'CONFIRMADA' || reference?.trim())
                            act({ action: 'ESTADO', paymentId: p.RPL_ID, state, reference });
                        }}
                      >
                        {['PENDIENTE', 'CONFIRMADA', 'RECHAZADA'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    )}
                    {p.RPL_ESTADO !== 'ANULADA' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt(
                            'Motivo de anulación del registro de pago (no revierte una transferencia bancaria):',
                          );
                          if (reason?.trim())
                            act({ action: 'ANULAR', paymentId: p.RPL_ID, reason });
                        }}
                      >
                        Anular registro
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No hay pagos registrados.</p>
        )}
      </section>
      {Number(d.pending) > 0 && (
        <section className="hr-card">
          <h2>Registrar pago</h2>
          <p className="text-sm">
            Esta acción registra un pago ya realizado. No envía dinero al banco.
          </p>
          <div className="workflow-fields">
            <label>
              Estado
              <select className="control" value={state} onChange={(e) => setState(e.target.value)}>
                {['PENDIENTE', 'CONFIRMADA', 'RECHAZADA', 'ANULADA'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Cuenta del empleado *
              <ForeignKeySelect
                api={api}
                field={{
                  label: 'Cuenta',
                  required: true,
                  ref: { table: 'NOM_CUENTA_BANCARIA_EMPLEADO' },
                }}
                filters={{ EML_ID: l.EML_ID }}
                value={bankId}
                onChange={setBankId}
              />
            </label>
            <label>
              Fecha *
              <input
                className="control"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Monto *
              <input
                className="control"
                type="number"
                min="0.01"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label>
              Referencia bancaria {state === 'CONFIRMADA' ? '*' : '(opcional)'}
              <input
                className="control"
                maxLength={200}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          </div>
          <Button
            disabled={
              busy ||
              !d.balanced ||
              !bankId ||
              !value ||
              (state === 'CONFIRMADA' && !reference.trim()) ||
              !date
            }
            onClick={async () => {
              if (await act({ bankId, date, amount: value, reference, state })) {
                setValue('');
                setReference('');
              }
            }}
          >
            Guardar pago
          </Button>
        </section>
      )}
    </>
  );
}
function History({ data, page, setPage }) {
  return (
    <section className="hr-card">
      <h2>{data.total} eventos registrados</h2>
      <p className="notice mt-4">
        El historial comienza con esta mejora. No reconstruye cambios anteriores. «Identidad no
        autenticada» indica una sesión local; un nombre elegido en un catálogo no acredita quién
        realizó la acción.
      </p>
      {data.rows.map((r) => {
        const keys = [
          ...new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})]),
        ].filter((k) => JSON.stringify(r.before?.[k]) !== JSON.stringify(r.after?.[k]));
        return (
          <article className="history-event mt-5" key={r.RHE_ID}>
            <h3 className="font-semibold">
              {r.action.replaceAll('_', ' ')} · {r.at}
            </h3>
            <p>
              {r.actor} ·{' '}
              {r.verified === '1'
                ? 'Identidad validada por el sistema anfitrión'
                : 'Identidad no autenticada'}
            </p>
            <p>
              {r.reason || 'Sin motivo adicional'}
              {r.effective ? ` · Fecha efectiva: ${r.effective}` : ''}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer">Ver cambios</summary>
              <dl className="mt-2">
                {keys.map((k) => (
                  <div key={k} className="contents">
                    <dt>{label(k)}</dt>
                    <dd className="break-words">
                      {typeof r.before?.[k] === 'object' || typeof r.after?.[k] === 'object' ? (
                        <pre className="whitespace-pre-wrap text-xs">
                          {JSON.stringify({ antes: r.before?.[k], despues: r.after?.[k] }, null, 2)}
                        </pre>
                      ) : (
                        <>
                          {String(r.before?.[k] ?? 'Sin valor')} →{' '}
                          {String(r.after?.[k] ?? 'Sin valor')}
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </article>
        );
      })}
      {!data.rows.length && <p>No hay cambios registrados para esta gestión.</p>}
      <div className="workflow-actions">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </Button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(data.total / 20))}
        </span>
        <Button
          variant="outline"
          disabled={page * 20 >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </div>
    </section>
  );
}
