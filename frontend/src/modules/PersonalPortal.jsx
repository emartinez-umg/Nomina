import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../auth/AuthGate';
import { roles, roleLabels } from '../../../shared/access.js';
import { localDate } from '../../../shared/business-rules.js';
import { useWorkspace } from '../state/WorkspaceContext';
import { ForeignKeySelect } from '../components/ForeignKeySelect';
import { Button } from '../components/ui/button';
import { amount } from './Dashboard';
const field = (label, table) => ({ label, ref: { table } });
function useData(api, path) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [revision, reload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    api(path, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [api, path, revision]);
  return { data, error, reload: () => reload((v) => v + 1) };
}
function Failure({ error }) {
  return error ? (
    <p role="alert" className="notice">
      {error}
    </p>
  ) : null;
}
export function MyInformation({ api }) {
  const { data, error } = useData(api, '/personal/mi-informacion');
  return (
    <section className="hr-card space-y-5">
      <h2>Mi información y boletas</h2>
      <Failure error={error} />
      {!data && !error ? (
        <p role="status">Cargando…</p>
      ) : (
        data && (
          <>
            {data.employees.length ? (
              data.employees.map((e) => (
                <div key={e.EML_ID}>
                  <h3>
                    {e.PER_NOMBRES} {e.PER_APELLIDOS}
                  </h3>
                  <p>
                    {e.EML_CODIGO} · Ordinario mensual: {amount(e.EML_SALARIO_ORDINARIO_MENSUAL)} ·
                    Bonificación: {amount(e.EML_SALARIO_BONIFICACION_DECRETO)}
                  </p>
                </div>
              ))
            ) : (
              <p>
                Tu usuario todavía no está vinculado a un empleado en esta empresa. Solicita a
                Recursos Humanos que revise la persona asignada a tu usuario.
              </p>
            )}
            <h3>Boletas disponibles</h3>
            {data.slips.length ? (
              data.slips.map((s) => (
                <article className="hr-card" key={s.NOD_ID}>
                  <h4>
                    {s.NPE_MES}/{s.NPE_ANIO}
                    {s.NPE_QUINCENA ? ` · Quincena ${s.NPE_QUINCENA}` : ''}
                  </h4>
                  <p>
                    Ingresos: {amount(s.NOD_INGRESOS)} · Deducciones: {amount(s.NOD_DEDUCCIONES)} ·
                    Líquido: {amount(s.NOD_LIQUIDO)}
                  </p>
                  <p>
                    {s.NOM_ESTADO === 'PAGADA'
                      ? 'Pago registrado'
                      : 'Calculada · pendiente de pago'}
                  </p>
                </article>
              ))
            ) : (
              <p>Aún no hay boletas disponibles.</p>
            )}
            {data.slips.length > 0 && (
              <Button variant="outline" onClick={() => window.print()}>
                Imprimir mis boletas
              </Button>
            )}
          </>
        )
      )}
    </section>
  );
}
const colors = {
  Vacaciones: '#dbeafe',
  Ausencia: '#ffedd5',
  Asueto: '#dcfce7',
  'Pago y cierre': '#ede9fe',
};
export function StaffCalendar({ api, go, role }) {
  const [date, setDate] = useState(localDate()),
    [view, setView] = useState('month'),
    [department, setDepartment] = useState(''),
    [holiday, setHoliday] = useState({ name: '', date: localDate() }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const workspace = useWorkspace();
  const anchor = new Date(date + 'T12:00:00');
  const start =
    view === 'month'
      ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      : new Date(
          anchor.getFullYear(),
          anchor.getMonth(),
          anchor.getDate() - ((anchor.getDay() + 6) % 7),
        );
  const end =
    view === 'month'
      ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const params = new URLSearchParams({
    from: localDate(start),
    to: localDate(end),
    ...(department ? { department } : {}),
  });
  const result = useData(api, '/personal/calendario?' + params);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(localDate(d));
  async function addHoliday(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/personal/asuetos', { method: 'POST', body: JSON.stringify(holiday) });
      setHoliday({ ...holiday, name: '' });
      result.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hr-card space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2>Calendario del personal</h2>
        <div className="flex flex-wrap gap-2">
          <label>
            Fecha
            <input
              className="control ml-2"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
          <select
            aria-label="Vista del calendario"
            className="control"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="month">Mes</option>
            <option value="week">Semana</option>
          </select>
        </div>
      </div>
      {role !== roles.EMPLOYEE && (
        <div className="max-w-md">
          <label htmlFor="calendar-department">Departamento</label>
          <ForeignKeySelect
            id="calendar-department"
            field={field('Departamento', 'ERP_DEPARTAMENTO')}
            value={department}
            onChange={setDepartment}
            api={api}
            filters={{ EMP_ID: workspace.company }}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3" aria-label="Leyenda">
        {Object.entries(colors).map(([type, color]) => (
          <span className="rounded px-2 py-1" key={type} style={{ background: color }}>
            {type}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Las fechas de pago son programadas; consulta tu boleta para ver si se registró el pago.
      </p>
      <Failure error={result.error} />
      {!result.data && !result.error ? (
        <p role="status">Cargando calendario…</p>
      ) : (
        <div className="calendar-grid">
          {Array.from({ length: (start.getDay() + 6) % 7 }, (_, i) => (
            <div key={'blank-' + i} aria-hidden="true" className="calendar-empty" />
          ))}
          {days.map((day) => (
            <article className="calendar-day" key={day}>
              <h3>
                {new Date(day + 'T12:00:00').toLocaleDateString('es-GT', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </h3>
              {result.data
                ?.filter((e) => e.start <= day && e.end >= day)
                .map((e) => (
                  <button
                    key={e.key}
                    disabled={role === roles.EMPLOYEE || !e.slug}
                    className="calendar-event"
                    style={{ background: colors[e.type] }}
                    onClick={() => go(e.slug, { registro: e.id })}
                  >
                    <strong>{e.type}</strong>
                    <span>{e.name}</span>
                    {e.state && <small>{e.state.replaceAll('_', ' ')}</small>}
                  </button>
                ))}
            </article>
          ))}
        </div>
      )}
      {role === roles.SYSTEM && (
        <form onSubmit={addHoliday} className="border-t pt-4">
          <h3>Agregar asueto de la empresa</h3>
          <Failure error={error} />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label>
              Nombre
              <input
                className="control block"
                required
                maxLength={150}
                value={holiday.name}
                onChange={(e) => setHoliday({ ...holiday, name: e.target.value })}
                placeholder="Ej. Aniversario local"
              />
            </label>
            <label>
              Fecha
              <input
                className="control block"
                type="date"
                required
                value={holiday.date}
                onChange={(e) => setHoliday({ ...holiday, date: e.target.value })}
              />
            </label>
            <Button disabled={busy}>Guardar asueto</Button>
          </div>
        </form>
      )}
    </section>
  );
}
const stateLabels = {
  RECIBIDA: 'Recibida',
  EN_REVISION: 'En revisión',
  CONTRATADA: 'Contratada',
  DESCARTADA: 'Descartada',
};
export function Recommendations({ api, go, role }) {
  const result = useData(api, '/personal/recomendaciones');
  const empty = { name: '', phone: '', email: '', position: '', reason: '' };
  const [form, setForm] = useState(empty),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState({});
  const update = (name, value) => setForm((v) => ({ ...v, [name]: value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/personal/recomendaciones', { method: 'POST', body: JSON.stringify(form) });
      setForm(empty);
      result.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function review(row, state) {
    setError('');
    setBusy(true);
    try {
      await api('/personal/recomendaciones/' + row.NRE_ID, {
        method: 'PUT',
        body: JSON.stringify({ state, note: notes[row.NRE_ID] ?? row.NRE_NOTA ?? '' }),
      });
      result.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <form className="hr-card space-y-4" onSubmit={submit}>
        <h2>Recomendar una persona</h2>
        <p>
          Completa el nombre, el puesto y al menos un medio de contacto. Esta primera versión no
          recibe archivos de CV.
        </p>
        <Failure error={error} />
        <div className="form-grid">
          {[
            ['name', 'Nombre completo', 'text', 'Ej. Ana María López'],
            ['phone', 'Teléfono', 'tel', 'Ej. 2222-3333'],
            ['email', 'Correo', 'email', 'Ej. ana@correo.com'],
          ].map(([key, label, type, placeholder]) => (
            <label key={key}>
              {label}
              <input
                className="control w-full"
                type={type}
                required={key === 'name'}
                maxLength={key === 'phone' ? 9 : 200}
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
                placeholder={placeholder}
              />
            </label>
          ))}
          <div>
            <label htmlFor="ref-position">Puesto</label>
            <ForeignKeySelect
              id="ref-position"
              field={field('Puesto', 'NOM_PUESTO')}
              value={form.position}
              onChange={(v) => update('position', v)}
              api={api}
            />
          </div>
          <label className="sm:col-span-2">
            Motivo
            <textarea
              className="control w-full"
              required
              maxLength={1000}
              value={form.reason}
              onChange={(e) => update('reason', e.target.value)}
              placeholder="Explica por qué recomiendas a esta persona"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <Button disabled={busy}>Enviar recomendación</Button>
        </div>
      </form>
      <section className="hr-card space-y-4">
        <h2>{role === roles.EMPLOYEE ? 'Mis recomendaciones' : 'Recomendaciones de la empresa'}</h2>
        <Failure error={result.error} />
        {result.data?.length === 0 && <p>No hay recomendaciones registradas.</p>}
        {result.data?.map((r) => (
          <article className="hr-card space-y-2" key={r.NRE_ID}>
            <h3>{r.NRE_NOMBRE}</h3>
            <p>
              {r.NRE_TELEFONO} {r.NRE_CORREO}
            </p>
            <p>{r.NRE_MOTIVO}</p>
            <span className="status">{stateLabels[r.NRE_ESTADO]}</span>
            {role !== roles.EMPLOYEE && (
              <div className="space-y-2">
                <label>
                  Comentario interno de RRHH
                  <textarea
                    className="control w-full"
                    maxLength={1000}
                    value={notes[r.NRE_ID] ?? r.NRE_NOTA ?? ''}
                    onChange={(e) => setNotes((v) => ({ ...v, [r.NRE_ID]: e.target.value }))}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="control"
                    aria-label={'Estado de ' + r.NRE_NOMBRE}
                    disabled={busy}
                    value={r.NRE_ESTADO}
                    onChange={(e) => review(r, e.target.value)}
                  >
                    {Object.entries(stateLabels).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" disabled={busy} onClick={() => review(r, r.NRE_ESTADO)}>
                    Guardar nota
                  </Button>
                  <Button onClick={() => go('alta-empleado', { recomendacion: r.NRE_ID })}>
                    Abrir contratación
                  </Button>
                </div>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
export function UserAdministration({ api }) {
  const { user } = useAuth(),
    workspace = useWorkspace();
  const result = useData(api, '/admin/usuarios');
  const [assignment, setAssignment] = useState({
    userId: '',
    companyId: workspace.company,
    role: roles.EMPLOYEE,
  });
  const [form, setForm] = useState({
      login: '',
      password: '',
      personId: '',
      companyId: workspace.company,
      role: roles.EMPLOYEE,
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/usuarios', { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...form, login: '', password: '', personId: '' });
      setMessage('Usuario creado. Deberá cambiar su contraseña al ingresar.');
      result.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hr-card space-y-5">
      <h2>Usuarios y roles</h2>
      <form onSubmit={submit} className="space-y-4">
        <Failure error={error} />
        {message && <p role="status">{message}</p>}
        <div className="form-grid">
          <label>
            Usuario
            <input
              className="control w-full"
              required
              pattern="[a-zA-Z0-9._@-]{3,80}"
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              placeholder="Ej. ana.lopez"
            />
          </label>
          <label>
            Contraseña temporal
            <input
              className="control w-full"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <small>De 12 a 128 caracteres. Se cambia en el primer ingreso.</small>
          </label>
          <div>
            <label htmlFor="user-person">Persona</label>
            <ForeignKeySelect
              id="user-person"
              field={field('Persona', 'ERP_PERSONA')}
              value={form.personId}
              onChange={(v) => setForm({ ...form, personId: v })}
              api={api}
            />
          </div>
          <div>
            <label htmlFor="new-user-company">Empresa</label>
            <ForeignKeySelect
              id="new-user-company"
              field={field('Empresa', 'ERP_EMPRESA')}
              value={form.companyId}
              onChange={(v) => setForm({ ...form, companyId: v })}
              api={api}
            />
          </div>
          <label>
            Rol
            <select
              className="control w-full"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {Object.entries(roleLabels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <Button disabled={busy}>Crear usuario</Button>
        </div>
      </form>
      <form
        className="space-y-3 border-t pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/admin/usuarios/' + assignment.userId + '/rol', {
              method: 'PUT',
              body: JSON.stringify(assignment),
            });
            setMessage('Asignación guardada. El usuario deberá volver a iniciar sesión.');
            result.reload();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Asignar empresa y rol a un usuario existente</h3>
        <div className="form-grid">
          <div>
            <label htmlFor="assign-user">Usuario</label>
            <ForeignKeySelect
              id="assign-user"
              field={field('Usuario', 'ERP_USUARIO')}
              value={assignment.userId}
              onChange={(v) => setAssignment({ ...assignment, userId: v })}
              api={api}
            />
          </div>
          <div>
            <label htmlFor="assign-company">Empresa</label>
            <ForeignKeySelect
              id="assign-company"
              field={field('Empresa', 'ERP_EMPRESA')}
              value={assignment.companyId}
              onChange={(v) => setAssignment({ ...assignment, companyId: v })}
              api={api}
            />
          </div>
          <label>
            Rol
            <select
              className="control w-full"
              value={assignment.role}
              onChange={(e) => setAssignment({ ...assignment, role: e.target.value })}
            >
              {Object.entries(roleLabels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <Button disabled={busy || !assignment.userId || !assignment.companyId}>
            Guardar asignación
          </Button>
        </div>
      </form>
      <Failure error={result.error} />
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Empresa</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {result.data?.map((u, i) => (
              <tr key={i}>
                <td>{u.USU_LOGIN}</td>
                <td>
                  <select
                    className="control"
                    aria-label={'Rol de ' + u.USU_LOGIN}
                    value={u.ROL_NOMBRE}
                    disabled={busy}
                    onChange={async (e) => {
                      const role = e.target.value;
                      if (
                        !window.confirm(
                          `¿Cambiar el rol de ${u.USU_LOGIN}? Se cerrarán sus sesiones.`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError('');
                      try {
                        await api('/admin/usuarios/' + u.USU_ID + '/rol', {
                          method: 'PUT',
                          body: JSON.stringify({ companyId: u.EMP_ID, role }),
                        });
                        result.reload();
                      } catch (e) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {Object.entries(roleLabels).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.EMP_RAZON_SOCIAL}</td>
                <td>{u.USU_ACTIVO === '1' ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function ClosingNotices({ api, go }) {
  const [open, setOpen] = useState(true);
  const { data, error } = useData(api, '/personal/avisos');
  if (error)
    return (
      <p className="notice" role="status">
        No se pudieron cargar los avisos de cierre.
      </p>
    );
  return (
    <div data-tour="notices">
      {!!data?.length && (
        <Button
          variant="outline"
          className="mb-3"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <Bell /> Avisos de cierre ({data.length})
        </Button>
      )}
      {open &&
        data?.map((n) => (
          <section className="notice mb-3" key={n.id}>
            <p>{n.message}</p>
            <Button variant="outline" onClick={() => go(n.slug, n.params)}>
              Revisar vacaciones
            </Button>
            <Button variant="outline" onClick={() => go('marcaje', n.attendance)} className="ml-2">
              Revisar marcajes
            </Button>
          </section>
        ))}
    </div>
  );
}
