import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, CheckCircle2, ClipboardList } from 'lucide-react';
import schema from '../../../shared/schema.json';
import { Button } from '../components/ui/button';
import { RecordForm } from '../components/RecordForm';
import { amount } from './Dashboard';
export function EmployeeFile({ api, go }) {
  const id = new URLSearchParams(location.search).get('empleado'),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [edit, setEdit] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    async function load() {
      if (!id) throw Error('Selecciona un empleado desde el listado.');
      const e = await api('/empleado/' + id, { signal: c.signal }),
        p = await api('/erp-persona/' + e.PER_ID, { signal: c.signal });
      const defs = [
        ['relacion-laboral', 'Relaciones laborales', 'EML_ID', id],
        ['cuenta-bancaria-empleado', 'Cuentas bancarias', 'EML_ID', id],
        ['contacto-emergencia', 'Contactos de emergencia', 'EML_ID', id],
        ['erp-persona-documento', 'Documentos de identidad', 'PER_ID', e.PER_ID],
        ['erp-persona-correo', 'Correos electrónicos', 'PER_ID', e.PER_ID],
        ['erp-persona-telefono', 'Teléfonos', 'PER_ID', e.PER_ID],
        ['erp-persona-direccion', 'Direcciones', 'PER_ID', e.PER_ID],
      ];
      const sections = await Promise.all(
        defs.map(async ([slug, title, field, value]) => ({
          slug,
          title,
          field,
          value,
          ...(await api(
            '/' +
              slug +
              '?' +
              new URLSearchParams({ filterField: field, filterValue: value, pageSize: '5' }),
            { signal: c.signal },
          )),
        })),
      );
      return { e, p, sections };
    }
    load()
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [api, id, revision]);
  if (error)
    return (
      <div role="alert" className="hr-card">
        <p>{error}</p>
        <Button variant="outline" onClick={() => go('empleado')}>
          Ir a empleados
        </Button>
      </div>
    );
  if (!data)
    return (
      <div role="status" className="hr-card">
        Cargando expediente…
      </div>
    );
  const all = [...schema.tables, ...schema.masters],
    find = (s) => all.find((t) => t.slug === s),
    { e, p, sections } = data;
  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => go('empleado')}>
        <ArrowLeft size={16} /> Empleados
      </Button>
      <section className="hr-hero">
        <div>
          <span className="eyebrow">EXPEDIENTE DEL EMPLEADO · {e.EML_CODIGO}</span>
          <h2>
            {p.PER_NOMBRES} {p.PER_APELLIDOS}
          </h2>
          <p>
            {e.EML_ACTIVO === '1' ? 'Empleado activo' : 'Empleado inactivo'} · Salario ordinario:{' '}
            {amount(e.EML_SALARIO_ORDINARIO_MENSUAL)} · Bonificación:{' '}
            {amount(e.EML_SALARIO_BONIFICACION_DECRETO)}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setEdit({ table: find('empleado'), row: e })}>
              <Pencil size={16} /> Editar empleado
            </Button>
            <Button
              variant="outline"
              onClick={() => setEdit({ table: find('erp-persona'), row: p })}
            >
              Editar datos personales
            </Button>
          </div>
        </div>
      </section>
      <div className="hr-card">
        <h2>Gestiones de este empleado</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => go('revision', { tipo: 'historial', empleado: id })}
          >
            Historial de cambios y remuneración
          </Button>
          {[
            ['vacacion', 'Vacaciones'],
            ['ausencia', 'Ausencias'],
            ['prestamo', 'Préstamos'],
            ['descuento-aplicado', 'Descuentos'],
            ['marcaje', 'Marcajes'],
            ['liquidacion-laboral', 'Liquidaciones'],
          ].map(([s, label]) => (
            <Button
              key={s}
              variant="outline"
              onClick={() =>
                go(
                  s,
                  s === 'marcaje' ? { employee: id } : { filterField: 'EML_ID', filterValue: id },
                )
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="hr-two-columns">
        {sections.map((s) => (
          <section key={s.slug} className="hr-card">
            <div className="section-heading">
              <h2>{s.title}</h2>
              <span className="status muted">{s.total}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {s.total
                ? 'Información registrada.'
                : 'Completa esta información cuando corresponda.'}
            </p>
            {s.rows.map((r) => {
              const t = find(s.slug);
              return (
                <div key={r[t.pk]} className="hr-list-item">
                  <div>
                    {s.slug === 'relacion-laboral' ? (
                      <>
                        <strong>
                          {r.__LABEL_PUE_ID} · {r.RLA_ESTADO}
                        </strong>
                        <p>
                          {r.__LABEL_SUC_ID} · Desde {r.RLA_FECHA_INGRESO}
                        </p>
                        <button
                          className="text-sm font-semibold text-primary"
                          onClick={() =>
                            go('relacion-jornada', { filterField: 'RLA_ID', filterValue: r.RLA_ID })
                          }
                        >
                          Asignar o consultar jornada →
                        </button>
                        <button
                          className="ml-4 text-sm font-semibold text-primary"
                          onClick={() => go('revision', { tipo: 'baja', id: r.RLA_ID })}
                        >
                          Registrar o consultar baja →
                        </button>
                        <button
                          className="ml-4 text-sm font-semibold text-primary"
                          onClick={() =>
                            go('ingreso-variable', { filterField: 'RLA_ID', filterValue: r.RLA_ID })
                          }
                        >
                          Ingresos variables →
                        </button>
                      </>
                    ) : (
                      <strong>
                        {s.slug === 'cuenta-bancaria-empleado'
                          ? `${r.__LABEL_BAN_ID} · ${r.CBE_NUMERO}`
                          : s.slug === 'contacto-emergencia'
                            ? `${r.NCE_NOMBRE} · ${r.NCE_TELEFONO}`
                            : s.slug === 'erp-persona-documento'
                              ? `${r.__LABEL_TDI_ID} · ${r.PDC_NUMERO}`
                              : s.slug === 'erp-persona-correo'
                                ? r.PCO_CORREO
                                : s.slug === 'erp-persona-telefono'
                                  ? r.PTE_NUMERO
                                  : r.__LABEL_DIR_ID}
                      </strong>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${s.title} ${r[t.pk]}`}
                    onClick={() => setEdit({ table: t, row: r })}
                  >
                    <Pencil size={16} />
                  </Button>
                </div>
              );
            })}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEdit({ table: find(s.slug), defaults: { [s.field]: s.value } })}
              >
                <Plus size={16} /> Agregar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => go(s.slug, { filterField: s.field, filterValue: s.value })}
              >
                <ClipboardList size={16} /> Ver todos
              </Button>
            </div>
          </section>
        ))}
      </div>
      {edit && (
        <RecordForm
          table={edit.table}
          row={
            edit.row
              ? Object.fromEntries(Object.entries(edit.row).filter(([k]) => !k.startsWith('__')))
              : null
          }
          initialValues={edit.defaults}
          api={api}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
