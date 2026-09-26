import { useWorkspace } from '../state/WorkspaceContext';
import Decimal from 'decimal.js';
import { useEffect, useState } from 'react';
import {
  UserPlus,
  Users,
  Wallet,
  CalendarDays,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ForeignKeySelect } from '../components/ForeignKeySelect';
export const amount = (v) => new Decimal(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const monthName = (n) =>
  [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ][Number(n) - 1] || '—';
export function Dashboard({ api, go }) {
  const { company } = useWorkspace();
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    api('/hr/dashboard?' + new URLSearchParams({ company }), { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [api, company, revision]);
  return (
    <div className="space-y-6">
      <section className="hr-hero">
        <div>
          <span className="eyebrow">RECURSOS HUMANOS</span>
          <h2>Todo empieza con las personas.</h2>
          <p>Revisa tu equipo, completa expedientes y organiza la próxima planilla.</p>
          <Button onClick={() => go('alta-empleado')}>
            <UserPlus size={18} /> Contratar empleado
          </Button>
        </div>
        <div className="hero-note">
          <span>Tu ruta de trabajo</span>
          <strong>Persona → Empleado → Contratación</strong>
          <p>Un alta guiada reúne los tres pasos en un solo proceso.</p>
        </div>
      </section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={16} /> Actualizar resumen
        </Button>
      </div>
      {error ? (
        <div role="alert" className="hr-card text-destructive">
          {error}
          <Button className="ml-4" variant="outline" onClick={() => setRevision((r) => r + 1)}>
            Reintentar
          </Button>
        </div>
      ) : !data ? (
        <div role="status" className="hr-card">
          Consultando información del equipo…
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <Metric
              icon={Users}
              title="Empleados activos"
              value={data.staff.active}
              detail={`${data.staff.total} empleados registrados`}
              onClick={() =>
                go('empleado', {
                  filterField: 'EML_ACTIVO',
                  filterValue: '1',
                  ...(company ? { company } : {}),
                })
              }
            />
            <Metric
              icon={Wallet}
              title="Salarios mensuales registrados"
              value={amount(data.staff.monthlySalary)}
              detail="Ordinario + bonificación de empleados activos"
            />
            <Metric
              icon={CalendarDays}
              title="Vacaciones por revisar"
              value={data.vacations.pending}
              detail="Solicitudes en estado SOLICITADA"
              onClick={() =>
                go('vacacion', {
                  filterField: 'VAC_ESTADO',
                  filterValue: 'SOLICITADA',
                  ...(company ? { company } : {}),
                })
              }
            />
            <Metric
              icon={AlertCircle}
              title="Sin contratación activa"
              value={data.staff.withoutContract}
              detail={`${data.staff.withoutBank} empleados activos sin cuenta bancaria`}
              onClick={() =>
                document.getElementById('attention')?.scrollIntoView({ behavior: 'smooth' })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Los salarios son importes mensuales registrados, antes de deducciones; no representan
            una planilla calculada. Los importes se muestran en la unidad monetaria usada al
            registrarlos.
          </p>
          <div className="hr-two-columns">
            <section className="hr-card">
              <div className="section-heading">
                <h2>Planillas recientes</h2>
                <button onClick={() => go('nomina')} className="text-sm font-semibold text-primary">
                  Ver todas →
                </button>
              </div>
              {data.payroll.length ? (
                data.payroll.map((n) => (
                  <button
                    key={n.NOM_ID}
                    className="hr-list-item"
                    onClick={() =>
                      go('nomina-detalle', { filterField: 'NOM_ID', filterValue: n.NOM_ID })
                    }
                  >
                    <div>
                      <strong>
                        {monthName(n.NPE_MES)} {n.NPE_ANIO}
                        {n.NPE_QUINCENA ? ` · Quincena ${n.NPE_QUINCENA}` : ''}
                      </strong>
                      <p>
                        {n.EMP_RAZON_SOCIAL} · {n.employees} detalles
                      </p>
                      <span className="status pending">{n.NOM_ESTADO}</span>
                    </div>
                    <div className="text-right">
                      <strong>{amount(n.net)}</strong>
                      <p>Líquido registrado</p>
                    </div>
                  </button>
                ))
              ) : (
                <Empty
                  text="Todavía no hay planillas. Abre un período y registra la primera planilla."
                  action="Crear período"
                  onClick={() => go('periodo', { nuevo: '1' })}
                />
              )}
            </section>
            <section className="hr-card">
              <h2>Equipo por departamento</h2>
              <p className="text-sm text-muted-foreground">
                Empleados activos con relación activa. Una persona puede participar en varios
                departamentos.
              </p>
              {data.departments.length ? (
                data.departments.map((d, i) => (
                  <div key={i} className="mt-5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{d.name}</span>
                      <strong>{d.count}</strong>
                    </div>
                    <div className="department-track">
                      <span
                        style={{
                          width: `${(100 * Number(d.count)) / Math.max(...data.departments.map((d) => Number(d.count)), 1)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <Empty text="Asigna departamentos en las relaciones laborales para ver la distribución." />
              )}
            </section>
          </div>
          <div className="hr-two-columns">
            <section className="hr-card" id="attention">
              <h2>Información pendiente de revisar</h2>
              <p className="text-sm text-muted-foreground">
                Mostrando {data.attention.length} de {data.attentionTotal} empleados activos con
                información por revisar.
              </p>
              <Button
                variant="outline"
                className="my-3"
                onClick={() => go('empleado', { pending: '1' })}
              >
                Ver todos los expedientes por revisar
              </Button>
              {data.attention.length ? (
                data.attention.map((e) => (
                  <button
                    className="hr-list-item"
                    key={e.EML_ID}
                    onClick={() => go('expediente', { empleado: e.EML_ID })}
                  >
                    <div>
                      <strong>{e.name}</strong>
                      <p>
                        {e.EML_CODIGO} ·{' '}
                        {[
                          e.contract === '1' ? 'Sin relación activa' : '',
                          e.bank === '1' ? 'Sin cuenta bancaria' : '',
                          e.identity === '1' ? 'Sin documento' : '',
                          e.emergency === '1' ? 'Sin contacto de emergencia' : '',
                          e.contact === '1' ? 'Sin correo ni teléfono' : '',
                          e.address === '1' ? 'Sin dirección' : '',
                          e.schedule === '1' ? 'Sin jornada' : '',
                          e.contractType === '1' ? 'Sin tipo de contrato' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <ArrowRight size={18} />
                  </button>
                ))
              ) : (
                <Empty text="No hay faltantes en los ocho controles de esta lista. Los requisitos adicionales de cada puesto deben verificarse en el expediente." />
              )}
            </section>
            <section className="hr-card">
              <h2>Preparación de nómina</h2>
              <button
                className="hr-list-item"
                onClick={() =>
                  go('ingreso-variable', {
                    filterField: 'INV_ESTADO',
                    filterValue: 'PENDIENTE',
                    ...(company ? { company } : {}),
                  })
                }
              >
                <div>
                  <strong>{data.income.pending} ingresos variables pendientes</strong>
                  <p>Importe registrado: {amount(data.income.amount)}</p>
                </div>
                <ArrowRight size={18} />
              </button>
              <button
                className="hr-list-item"
                onClick={() =>
                  go('descuento-aplicado', {
                    filterField: 'DAP_ESTADO',
                    filterValue: 'PENDIENTE',
                    ...(company ? { company } : {}),
                  })
                }
              >
                <div>
                  <strong>{data.discounts.pending} descuentos pendientes</strong>
                  <p>Importe registrado: {amount(data.discounts.amount)}</p>
                </div>
                <ArrowRight size={18} />
              </button>
              <h3 className="mt-5 font-semibold">Períodos abiertos · calendario compartido</h3>
              {data.periods.length ? (
                data.periods.map((p) => (
                  <button
                    key={p.NPE_ID}
                    className="hr-list-item"
                    onClick={() =>
                      go('nomina', {
                        nuevo: '1',
                        NPE_ID: p.NPE_ID,
                        ...(company ? { EMP_ID: company } : {}),
                      })
                    }
                  >
                    <span>
                      {monthName(p.NPE_MES)} {p.NPE_ANIO} · {p.NPE_TIPO}
                      {p.NPE_QUINCENA ? ` · Q${p.NPE_QUINCENA}` : ''}
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No hay períodos abiertos.</p>
              )}
              <Button variant="outline" className="mt-4" onClick={() => go('guia')}>
                Consultar la guía de trabajo
              </Button>
            </section>
          </div>
          <p className="text-xs text-muted-foreground">
            Actualizado: {new Date(data.updatedAt).toLocaleString('es-GT')}
          </p>
        </>
      )}
    </div>
  );
}
function Metric({ icon: Icon, title, value, detail, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="metric-card" onClick={onClick}>
      <span className="metric-icon">
        <Icon size={21} />
      </span>
      <span className="metric-title">{title}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </Tag>
  );
}
function Empty({ text, action, onClick }) {
  return (
    <div className="hr-empty">
      <CheckCircle2 size={25} />
      <p>{text}</p>
      {action && (
        <Button variant="outline" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}
