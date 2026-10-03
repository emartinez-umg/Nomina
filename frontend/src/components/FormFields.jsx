import { canUseTable, roles } from '../../../shared/access.js';
import { useAuth } from '../auth/AuthGate';
import { birthBounds } from '../../../shared/business-rules.js';
import { useWorkspace } from '../state/WorkspaceContext';
import { stateOptions } from '../../../shared/workflow.js';
import { useEffect, useId, useState } from 'react';
import schema from '../../../shared/schema.json';
import { referenceFilters, friendlyOptions } from '../../../shared/hr-catalog.js';
import { hintFor, exampleFor, isPhone, phoneInput } from '../../../shared/field-help.js';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { ForeignKeySelect } from './ForeignKeySelect';
import { RecordForm } from './RecordForm';
import { fieldLayout } from './field-layout';
const allForms = [...schema.tables, ...schema.masters];
const months = [
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
];
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export function FormFields({
  table,
  values,
  update,
  errors = {},
  api,
  readOnly = false,
  editing = false,
  names,
  extraContext = {},
}) {
  const workspace = useWorkspace();
  const auth = useAuth();
  const memberships =
    auth?.user.memberships?.filter((m) => m.companyId === workspace?.company) || [];
  const role = memberships.some((m) => m.role === roles.SYSTEM)
    ? roles.SYSTEM
    : memberships.some((m) => m.role === roles.PAYROLL)
      ? roles.PAYROLL
      : auth?.user.role || roles.EMPLOYEE;
  const prefix = useId(),
    fields = table.fields.filter((f) => !f.identity && (!names || names.includes(f.name)));
  const [creating, setCreating] = useState(null),
    [derived, setDerived] = useState({}),
    [contextError, setContextError] = useState(''),
    [contextLoading, setContextLoading] = useState(false),
    [contextRetry, setContextRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setDerived({});
    setContextError('');
    async function load() {
      let employee = values.EML_ID,
        company = values.EMP_ID,
        relation = values.RLA_ID;
      if (table.name === 'NOM_TRANSFERENCIA_PAGO' && values.NOD_ID)
        relation = (await api('/nomina-detalle/' + values.NOD_ID)).RLA_ID;
      if (relation && !employee) employee = (await api('/relacion-laboral/' + relation)).EML_ID;
      if (employee) company = (await api('/empleado/' + employee)).EMP_ID;
      if (values.NOM_ID) company = (await api('/nomina/' + values.NOM_ID)).EMP_ID;
      if (live) setDerived({ EML_ID: employee, EMP_ID: company });
    }
    setContextLoading(true);
    load()
      .catch((e) => {
        if (live) setContextError(e.message);
      })
      .finally(() => {
        if (live) setContextLoading(false);
      });
    return () => {
      live = false;
    };
  }, [
    api,
    table.name,
    values.EML_ID,
    values.RLA_ID,
    values.NOM_ID,
    values.NOD_ID,
    values.EMP_ID,
    contextRetry,
  ]);
  const context = {
    ...values,
    ...derived,
    ...extraContext,
    EMP_ID: extraContext.EMP_ID || derived.EMP_ID || values.EMP_ID || workspace?.company,
    __employee: table.name === 'NOM_EMPLEADO',
  };
  return (
    <>
      {contextError && (
        <p role="alert" className="notice">
          {contextError}{' '}
          <button type="button" className="underline" onClick={() => setContextRetry((v) => v + 1)}>
            Reintentar opciones relacionadas
          </button>
        </p>
      )}
      {table.name === 'NOM_RELACION_LABORAL' && !readOnly && (
        <p className="notice">
          Para finalizar la relación usa «Registrar baja» desde el listado o expediente. Una nueva
          relación activa reactiva el expediente del empleado.
        </p>
      )}
      {table.name === 'NOM_NOMINA_DETALLE' && !readOnly && (
        <p className="notice">
          Registra los datos de la relación laboral. Los ingresos, deducciones y líquido se
          actualizan al conciliar los conceptos desde Revisar planilla.
        </p>
      )}
      {['NOM_NOMINA', 'NOM_VACACION'].includes(table.name) && !readOnly && (
        <p className="notice">
          El estado se gestiona desde la acción «Revisar» del listado, después de comprobar los
          pendientes.
        </p>
      )}
      <div className="form-layout">
        <div className="form-grid">
          {fields
            .filter((f) => {
              if (table.name === 'ERP_PERSONA') {
                if (['PER_RAZON_SOCIAL', 'PER_NOMBRE_COMERCIAL'].includes(f.name))
                  return values.PER_TIPO === 'J';
                if (['PER_NOMBRES', 'PER_APELLIDOS', 'PER_FECHA_NACIMIENTO'].includes(f.name))
                  return values.PER_TIPO !== 'J';
              }
              return f.default !== 'SYSTIMESTAMP' || editing;
            })
            .map((f) => {
              const id = prefix + '-' + f.name,
                hint = id + '-hint',
                errorId = id + '-error',
                disabled =
                  readOnly ||
                  f.generated ||
                  (f.name === 'USU_ID_CREA' && !auth?.user.localMode) ||
                  (table.name === 'NOM_RELACION_LABORAL' && f.name === 'MBA_ID') ||
                  (editing && table.name === 'NOM_RELACION_LABORAL' && f.name === 'EML_ID') ||
                  [
                    'NOD_INGRESOS',
                    'NOD_DEDUCCIONES',
                    'NOD_LIQUIDO',
                    'NOM_ESTADO',
                    'VAC_ESTADO',
                    'RLA_FECHA_BAJA',
                    'RLA_MOTIVO_BAJA',
                  ].includes(f.name) ||
                  (editing &&
                    table.name === 'NOM_EMPLEADO' &&
                    ['EMP_ID', 'PER_ID'].includes(f.name)) ||
                  (f.ref &&
                    (contextLoading || !!contextError) &&
                    ['RLA_ID', 'SUC_ID', 'DPT_ID', 'CBE_ID'].includes(f.name)) ||
                  (table.name === 'NOM_TRANSFERENCIA_PAGO' &&
                    f.name === 'CBE_ID' &&
                    !values.NOD_ID),
                description = hint + (errors[f.name] ? ' ' + errorId : '');
              return (
                <div key={f.name} {...fieldLayout(f)}>
                  <label htmlFor={id} className="mb-2 block text-sm font-semibold">
                    {f.label}
                    {(f.required ||
                      (f.name === 'TRP_REFERENCIA' && values.TRP_ESTADO === 'CONFIRMADA') ||
                      (table.name === 'ERP_PERSONA' &&
                        (values.PER_TIPO === 'J'
                          ? f.name === 'PER_RAZON_SOCIAL'
                          : ['PER_NOMBRES', 'PER_APELLIDOS'].includes(f.name)))) &&
                      f.default === undefined && <span className="ml-1 text-destructive">*</span>}
                  </label>
                  {f.name === 'USU_ID_CREA' && !auth?.user.localMode ? (
                    <Input
                      id={id}
                      value={
                        editing && values.USU_ID_CREA !== auth?.user.id
                          ? `Usuario ERP ${values.USU_ID_CREA}`
                          : auth?.user.login || 'Usuario de la sesión'
                      }
                      disabled
                      aria-describedby={description}
                    />
                  ) : f.ref ? (
                    <ForeignKeySelect
                      id={id}
                      field={f}
                      value={values[f.name] ?? ''}
                      api={api}
                      disabled={disabled}
                      filters={referenceFilters(f, context)}
                      onCreate={
                        !disabled &&
                        allForms.some((t) => t.name === f.ref.table && canUseTable(role, t, true))
                          ? () =>
                              setCreating({
                                table: allForms.find((t) => t.name === f.ref.table),
                                field: f,
                                defaults: Object.fromEntries(
                                  Object.entries(referenceFilters(f, context)).filter(
                                    ([k]) => !k.startsWith('__'),
                                  ),
                                ),
                              })
                          : undefined
                      }
                      onChange={(v) => update(f.name, v)}
                      invalid={!!errors[f.name]}
                      describedBy={description}
                    />
                  ) : f.boolean ? (
                    <div className="flex h-10 items-center gap-3">
                      <Switch
                        id={id}
                        checked={String(values[f.name]) === '1'}
                        onCheckedChange={(v) => update(f.name, v ? '1' : '0')}
                        disabled={disabled}
                        aria-describedby={description}
                      />
                      <span className="text-sm">
                        {String(values[f.name]) === '1' ? 'Sí' : 'No'}
                      </span>
                    </div>
                  ) : stateOptions(f) ? (
                    <select
                      id={id}
                      value={f.generated && !editing ? '' : (values[f.name] ?? '')}
                      onChange={(e) => update(f.name, e.target.value)}
                      disabled={disabled}
                      aria-invalid={!!errors[f.name]}
                      aria-describedby={description}
                      className="h-10 w-full rounded-lg border border-input bg-white px-3 text-base focus-visible:ring-2 aria-invalid:border-destructive"
                    >
                      <option value="">Selecciona {f.label.toLowerCase()}…</option>
                      {stateOptions(f)
                        .filter(
                          (v) =>
                            f.name !== 'NPE_ESTADO' ||
                            ['ABIERTO', 'CERRADO', values[f.name]].includes(v),
                        )
                        .filter(
                          (v) =>
                            !(
                              (f.name === 'RLA_ESTADO' && v === 'FINALIZADA') ||
                              (f.name === 'INV_ESTADO' && v === 'PAGADA') ||
                              (f.name === 'DAP_ESTADO' && v === 'APLICADO')
                            ) || values[f.name] === v,
                        )
                        .map((v) => (
                          <option key={v} value={v}>
                            {friendlyOptions[f.name]?.[v] ||
                              (f.name === 'JOD_DIA_SEMANA'
                                ? `${v} · ${days[Number(v) - 1]}`
                                : f.name === 'NPE_MES'
                                  ? months[Number(v) - 1]
                                  : v.replaceAll('_', ' '))}
                          </option>
                        ))}
                    </select>
                  ) : f.maxLength >= 300 ? (
                    <textarea
                      id={id}
                      rows={3}
                      value={f.generated && !editing ? '' : (values[f.name] ?? '')}
                      onChange={(e) => update(f.name, e.target.value)}
                      disabled={disabled}
                      aria-invalid={!!errors[f.name]}
                      aria-describedby={description}
                      maxLength={f.maxLength}
                      placeholder={f.generated ? 'Se asigna al guardar' : exampleFor(f)}
                      className="w-full rounded-lg border border-input p-3 focus-visible:ring-2 aria-invalid:border-destructive"
                    />
                  ) : (
                    <Input
                      id={id}
                      type={
                        f.input ||
                        { NUMBER: 'number', DATE: 'date', TIMESTAMP: 'datetime-local' }[f.type] ||
                        'text'
                      }
                      step={
                        f.type === 'NUMBER'
                          ? f.scale
                            ? String(10 ** -f.scale)
                            : '1'
                          : f.type === 'TIMESTAMP'
                            ? '0.000001'
                            : undefined
                      }
                      min={
                        f.name === 'PER_FECHA_NACIMIENTO'
                          ? birthBounds().min
                          : f.min !== undefined
                            ? f.exclusiveMin
                              ? String(Number(f.min) + 10 ** -f.scale)
                              : f.min
                            : f.type === 'DATE'
                              ? '0001-01-01'
                              : undefined
                      }
                      max={
                        f.name === 'PER_FECHA_NACIMIENTO'
                          ? birthBounds().max
                          : f.type === 'DATE'
                            ? '9999-12-31'
                            : undefined
                      }
                      value={f.generated && !editing ? '' : (values[f.name] ?? '')}
                      onChange={(e) =>
                        update(
                          f.name,
                          isPhone(f)
                            ? phoneInput(e.target.value, values[f.name] || '')
                            : e.target.value,
                        )
                      }
                      inputMode={isPhone(f) ? 'numeric' : undefined}
                      autoComplete={
                        isPhone(f) ? 'tel-national' : f.input === 'email' ? 'email' : undefined
                      }
                      disabled={disabled}
                      maxLength={isPhone(f) ? undefined : f.maxLength}
                      aria-invalid={!!errors[f.name]}
                      aria-describedby={description}
                      placeholder={f.generated ? 'Se asigna al guardar' : exampleFor(f)}
                    />
                  )}
                  <p id={hint} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {f.default === 'SYSTIMESTAMP' && !editing
                      ? 'Déjalo vacío para usar la fecha y hora del servidor.'
                      : f.name === 'TRP_REFERENCIA'
                        ? 'Obligatoria al seleccionar CONFIRMADA. Copia la referencia de la operación bancaria.'
                        : f.generated
                          ? 'Se asigna al guardar. Numeración automática por empresa.'
                          : hintFor(f)}
                  </p>
                  {errors[f.name] && (
                    <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
                      {errors[f.name]}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </div>
      {creating && (
        <RecordForm
          table={creating.table}
          api={api}
          initialValues={creating.defaults}
          onClose={() => setCreating(null)}
          onSaved={(row) => {
            update(creating.field.name, String(row[creating.table.pk]));
            setCreating(null);
          }}
        />
      )}
    </>
  );
}
