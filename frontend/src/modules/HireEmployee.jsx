import { useEffect, useState, useRef } from 'react';
import { CheckCircle2, ArrowLeft, ArrowRight, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import schema from '../../../shared/schema.json';
import { hintFor, phoneInput, validPhone } from '../../../shared/field-help.js';
import { validatePayload } from '../../../shared/validation.js';
import { FormFields } from '../components/FormFields';
import { ForeignKeySelect } from '../components/ForeignKeySelect';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { fieldLayout } from '../components/field-layout';
import { useWorkspace } from '../state/WorkspaceContext';
import { amount } from './Dashboard';
const all = [...schema.tables, ...schema.masters],
  table = (n) => all.find((t) => t.name === n);
const personTable = table('ERP_PERSONA'),
  employeeTable = table('NOM_EMPLEADO'),
  relationTable = table('NOM_RELACION_LABORAL');
const employeeFields = [
  'EMP_ID',
  'EML_CODIGO',
  'EML_IGSS',
  'EML_SALARIO_ORDINARIO_MENSUAL',
  'EML_SALARIO_BONIFICACION_DECRETO',
];
const relationFields = ['PUE_ID', 'SUC_ID', 'DPT_ID', 'TCT_ID', 'RLA_FECHA_INGRESO', 'USU_ID_CREA'];
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function HireEmployee({ api, go }) {
  const initialPerson = new URLSearchParams(location.search).get('persona') || '';
  const workspace = useWorkspace();
  const draftKey = `hire:${initialPerson}`;
  const draft = useRef(workspace?.drafts.get(draftKey)).current;
  const [step, setStep] = useState(draft?.step || 0),
    [mode, setMode] = useState(draft?.mode || (initialPerson ? 'existing' : 'new')),
    [personId, setPersonId] = useState(draft?.personId || initialPerson),
    [selected, setSelected] = useState(null),
    [person, setPerson] = useState(
      draft?.person || {
        PER_TIPO: 'F',
        PER_NOMBRES: '',
        PER_APELLIDOS: '',
        PER_FECHA_NACIMIENTO: '',
        PER_ACTIVO: '1',
      },
    ),
    [employee, setEmployee] = useState(
      draft?.employee || {
        EMP_ID: workspace?.company || '',
        EML_SALARIO_BONIFICACION_DECRETO: '0',
        EML_ACTIVO: '1',
      },
    ),
    [relation, setRelation] = useState(
      draft?.relation || { RLA_FECHA_INGRESO: localDate(), RLA_ESTADO: 'ACTIVA' },
    ),
    [email, setEmail] = useState(draft?.email || ''),
    [phone, setPhone] = useState(draft?.phone || ''),
    [errors, setErrors] = useState({}),
    [saving, setSaving] = useState(false),
    [result, setResult] = useState(null),
    [labels, setLabels] = useState({}),
    [labelError, setLabelError] = useState(''),
    [labelRetry, setLabelRetry] = useState(0);
  useEffect(() => {
    if (
      !result &&
      (step ||
        person.PER_NOMBRES ||
        person.PER_APELLIDOS ||
        personId ||
        email ||
        phone ||
        employee.EML_CODIGO)
    )
      workspace?.keepDraft(draftKey, {
        step,
        mode,
        personId,
        person,
        employee,
        relation,
        email,
        phone,
      });
  }, [
    step,
    mode,
    personId,
    person,
    employee,
    relation,
    email,
    phone,
    result,
    draftKey,
    workspace?.keepDraft,
  ]);
  useEffect(() => {
    let live = true;
    setSelected(null);
    if (personId)
      api('/erp-persona/' + personId)
        .then((p) => {
          if (live) setSelected(p);
        })
        .catch((e) => {
          if (live) setErrors({ _form: e.message });
        });
    return () => {
      live = false;
    };
  }, [api, personId]);
  useEffect(() => {
    let live = true;
    api('/lookups/ERP_USUARIO')
      .then((r) => {
        if (live && r.options.length === 1 && !r.hasMore)
          setRelation((v) => (v.USU_ID_CREA ? v : { ...v, USU_ID_CREA: r.options[0].value }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    if (step !== 3) return;
    let live = true;
    setLabels({});
    setLabelError('');
    Promise.all(
      [
        ['ERP_EMPRESA', employee.EMP_ID],
        ['NOM_PUESTO', relation.PUE_ID],
        ['ERP_SUCURSAL', relation.SUC_ID],
        ['ERP_DEPARTAMENTO', relation.DPT_ID],
        ['ERP_USUARIO', relation.USU_ID_CREA],
        ['NOM_TIPO_CONTRATO', relation.TCT_ID],
      ]
        .filter(([, id]) => id)
        .map(async ([name, id]) => [
          name,
          (await api(`/lookups/${name}?id=${id}`)).options[0]?.label || 'Referencia no disponible',
        ]),
    )
      .then((entries) => {
        if (live) setLabels(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (live) setLabelError(e.message);
      });
    return () => {
      live = false;
    };
  }, [
    step,
    api,
    employee.EMP_ID,
    relation.PUE_ID,
    relation.SUC_ID,
    relation.DPT_ID,
    relation.USU_ID_CREA,
    relation.TCT_ID,
    labelRetry,
  ]);
  function validate(index) {
    let e = {};
    if (index === 0) {
      if (mode === 'new') e = validatePayload(personTable, person, { create: true }).errors;
      else if (!selected) e = { PER_ID: 'Selecciona una persona.' };
      else if (selected.PER_TIPO !== 'F' || selected.PER_ACTIVO !== '1')
        e = { PER_ID: 'Selecciona una persona física activa.' };
      if (phone && !validPhone(phone)) e.phone = 'Ingresa exactamente 8 dígitos (ej.: 1234-5678).';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Ingresa un correo válido.';
    } else if (index === 1)
      e = validatePayload(
        employeeTable,
        { ...employee, PER_ID: personId || '1' },
        { create: true },
      ).errors;
    else if (index === 2)
      e = validatePayload(relationTable, { ...relation, EML_ID: '1' }, { create: true }).errors;
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const r = await api('/hr/contrataciones', {
        method: 'POST',
        body: JSON.stringify({
          ...(mode === 'new' ? { person } : { personId }),
          employee,
          relation,
          email: email || undefined,
          phone: phone || undefined,
        }),
      });
      workspace?.clearDraft(draftKey);
      setResult(r);
      toast.success('Empleado y contratación registrados.');
    } catch (e) {
      setErrors({ ...e.fields, _form: e.message });
    } finally {
      setSaving(false);
    }
  }
  if (result)
    return (
      <section className="hr-card text-center">
        <CheckCircle2 className="mx-auto mb-4 text-primary" size={48} />
        <h2>La contratación está registrada</h2>
        <p className="mt-3">
          {result.person.PER_NOMBRES} {result.person.PER_APELLIDOS} · {result.employee.EML_CODIGO}
        </p>
        <p className="mb-6 text-muted-foreground">
          Continúa en el expediente para registrar la cuenta bancaria, contactos y jornada.
        </p>
        <Button onClick={() => go('expediente', { empleado: result.employee.EML_ID })}>
          Abrir expediente <ArrowRight size={18} />
        </Button>
      </section>
    );
  const steps = ['Persona', 'Datos del empleado', 'Contratación', 'Revisar y guardar'];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {draft && <p className="notice">Borrador recuperado. Puedes continuar donde lo dejaste.</p>}
      <ol className="wizard-steps">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={step === i ? 'step' : undefined}
            className={i <= step ? 'reached' : ''}
          >
            <span>{i < step ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <section className="hr-card">
        <h2>{steps[step]}</h2>
        <p className="mb-6 text-muted-foreground">
          {
            [
              'Registra una persona física o reutiliza una existente para evitar duplicados.',
              'Define empresa, código interno y remuneración mensual.',
              'Asigna puesto y sucursal. Los departamentos se filtran por la empresa seleccionada.',
              'Revisa los datos. Al confirmar se guardan juntos la persona, el empleado y su relación laboral.',
            ][step]
          }
        </p>
        {errors._form && (
          <div role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-destructive">
            {errors._form}
          </div>
        )}
        <fieldset disabled={saving}>
          {step === 0 && (
            <>
              <div className="mb-6 flex flex-wrap gap-4">
                {[
                  ['new', 'Registrar nueva persona'],
                  ['existing', 'Usar persona existente'],
                ].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="person-mode"
                      checked={mode === v}
                      onChange={() => {
                        setMode(v);
                        setErrors({});
                      }}
                    />
                    {l}
                  </label>
                ))}
              </div>
              {mode === 'new' ? (
                <FormFields
                  table={personTable}
                  names={['PER_NOMBRES', 'PER_APELLIDOS', 'PER_FECHA_NACIMIENTO']}
                  values={person}
                  update={(n, v) => setPerson((p) => ({ ...p, [n]: v }))}
                  errors={errors}
                  api={api}
                />
              ) : (
                <>
                  <label htmlFor="hire-person" className="mb-2 block font-semibold">
                    Persona física *
                  </label>
                  <ForeignKeySelect
                    id="hire-person"
                    field={{ label: 'Persona', required: true, ref: { table: 'ERP_PERSONA' } }}
                    filters={{ PER_TIPO: 'F', PER_ACTIVO: '1' }}
                    value={personId}
                    onChange={setPersonId}
                    api={api}
                  />
                  {errors.PER_ID && (
                    <p role="alert" className="text-destructive">
                      {errors.PER_ID}
                    </p>
                  )}
                </>
              )}
              <div className="form-layout mt-6">
                <div className="form-grid">
                  <div {...fieldLayout({ name: 'PCO_CORREO', input: 'email' })}>
                    <label htmlFor="hire-email" className="mb-2 block text-sm font-semibold">
                      Correo electrónico (opcional)
                    </label>
                    <Input
                      id="hire-email"
                      type="email"
                      placeholder="correo@dominio.com"
                      autoComplete="email"
                      aria-describedby="hire-email-hint"
                      aria-invalid={!!errors.email}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <p id="hire-email-hint" className="mt-1.5 text-xs text-muted-foreground">
                      {hintFor({ name: 'PCO_CORREO', input: 'email' })}
                    </p>
                    {errors.email && (
                      <p role="alert" className="text-destructive">
                        {errors.email}
                      </p>
                    )}
                  </div>
                  <div {...fieldLayout({ name: 'PTE_NUMERO', input: 'tel' })}>
                    <label htmlFor="hire-phone" className="mb-2 block text-sm font-semibold">
                      Teléfono (opcional)
                    </label>
                    <Input
                      id="hire-phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder="1234-5678"
                      autoComplete="tel-national"
                      aria-describedby="hire-phone-hint"
                      aria-invalid={!!errors.phone}
                      value={phone}
                      onChange={(e) => setPhone(phoneInput(e.target.value, phone))}
                    />
                    <p id="hire-phone-hint" className="mt-1.5 text-xs text-muted-foreground">
                      {hintFor({ name: 'PTE_NUMERO', input: 'tel' })}
                    </p>
                    {errors.phone && (
                      <p role="alert" className="text-destructive">
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Los datos de contacto se agregarán a la persona al confirmar el alta.
              </p>
            </>
          )}
          {step === 1 && (
            <FormFields
              table={employeeTable}
              names={employeeFields}
              values={employee}
              update={(n, v) => {
                setEmployee((p) => ({ ...p, [n]: v }));
                if (n === 'EMP_ID') setRelation((p) => ({ ...p, SUC_ID: '', DPT_ID: '' }));
              }}
              errors={errors}
              api={api}
            />
          )}
          {step === 2 && (
            <>
              <FormFields
                table={relationTable}
                names={relationFields}
                values={relation}
                extraContext={{ EMP_ID: employee.EMP_ID }}
                update={(n, v) => setRelation((p) => ({ ...p, [n]: v }))}
                errors={errors}
                api={api}
              />
              <p className="mt-5 text-sm text-muted-foreground">
                “Usuario creador” identifica al operador registrado en el ERP. Cuando solo hay uno,
                se selecciona automáticamente.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              {labelError && (
                <div role="alert" className="notice">
                  {labelError}
                  <Button variant="outline" onClick={() => setLabelRetry((v) => v + 1)}>
                    Reintentar nombres
                  </Button>
                </div>
              )}
              <dl className="review-grid">
                {[
                  [
                    'Persona',
                    mode === 'new'
                      ? `${person.PER_NOMBRES} ${person.PER_APELLIDOS}`
                      : `${selected?.PER_NOMBRES} ${selected?.PER_APELLIDOS}`,
                  ],
                  ['Código', employee.EML_CODIGO],
                  [
                    'Fecha de nacimiento',
                    (mode === 'new' ? person : selected)?.PER_FECHA_NACIMIENTO || 'Sin registrar',
                  ],
                  ['IGSS', employee.EML_IGSS || 'Sin registrar'],
                  ['Correo que se agregará', email || 'Sin registrar'],
                  ['Teléfono que se agregará', phone || 'Sin registrar'],
                  [
                    'Tipo de contrato',
                    relation.TCT_ID
                      ? labels.NOM_TIPO_CONTRATO || (labelError ? 'No disponible' : 'Cargando…')
                      : 'Sin asignar',
                  ],
                  ['Empresa', labels.ERP_EMPRESA || (labelError ? 'No disponible' : 'Cargando…')],
                  ['Puesto', labels.NOM_PUESTO || (labelError ? 'No disponible' : 'Cargando…')],
                  ['Sucursal', labels.ERP_SUCURSAL || (labelError ? 'No disponible' : 'Cargando…')],
                  [
                    'Departamento',
                    relation.DPT_ID
                      ? labels.ERP_DEPARTAMENTO || (labelError ? 'No disponible' : 'Cargando…')
                      : 'Sin asignar',
                  ],
                  ['Fecha de ingreso', relation.RLA_FECHA_INGRESO],
                  ['Salario ordinario', amount(employee.EML_SALARIO_ORDINARIO_MENSUAL)],
                  ['Bonificación', amount(employee.EML_SALARIO_BONIFICACION_DECRETO)],
                  ['Operador', labels.ERP_USUARIO || (labelError ? 'No disponible' : 'Cargando…')],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm">
                Si algún dato no es válido, el alta completa se revierte para evitar empleados sin
                contratación. Los catálogos que hayas creado con “Crear” se guardan de forma
                independiente.
              </p>
              {Object.entries(errors)
                .filter(([k]) => k !== '_form')
                .map(([k, v]) => (
                  <p key={k} role="alert" className="text-destructive">
                    {v}
                  </p>
                ))}
            </>
          )}
        </fieldset>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            if (window.confirm('¿Descartar esta contratación sin guardar?')) {
              workspace?.clearDraft(draftKey);
              go('dashboard');
            }
          }}
        >
          Descartar contratación
        </Button>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              if (step === 0) go('dashboard');
              else {
                setStep((s) => s - 1);
                setErrors({});
              }
            }}
          >
            <ArrowLeft size={16} />
            {step === 0 ? 'Volver al inicio' : 'Anterior'}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => {
                if (validate(step)) setStep((s) => s + 1);
              }}
            >
              Continuar <ArrowRight size={16} />
            </Button>
          ) : (
            <Button disabled={saving || !!labelError || !labels.ERP_EMPRESA} onClick={save}>
              <UserPlus size={16} />
              {saving ? 'Guardando alta…' : 'Confirmar contratación'}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
