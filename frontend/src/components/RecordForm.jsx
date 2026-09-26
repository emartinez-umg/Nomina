import { useEffect, useState, useRef } from 'react';
import { useWorkspace } from '../state/WorkspaceContext';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { initialDefaults } from '../../../shared/hr-catalog.js';
import { FormFields } from './FormFields';
import { validatePayload } from '../../../shared/validation.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';

export function RecordForm({
  table,
  row,
  readOnly = false,
  api,
  onClose,
  onSaved,
  initialValues = {},
}) {
  const workspace = useWorkspace();
  const draftKey = `record:${table.name}:${row?.[table.pk] || JSON.stringify(initialValues)}`;
  const recovered = useRef(!readOnly && workspace?.drafts.get(draftKey));
  const [dirty, setDirty] = useState(!!recovered.current);
  const [reason, setReason] = useState(recovered.current?.reason || '');
  const [effectiveDate, setEffectiveDate] = useState(
    recovered.current?.effectiveDate ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
  );
  const fields = table.fields.filter((f) => !f.identity),
    [values, setValues] = useState(
      () =>
        recovered.current?.values ||
        Object.fromEntries(
          fields.map((f) => [
            f.name,
            row?.[f.name] ??
              initialValues[f.name] ??
              initialDefaults[table.name]?.[f.name] ??
              (f.default === 'SYSTIMESTAMP' ? '' : f.default) ??
              '',
          ]),
        ),
    ),
    [errors, setErrors] = useState({}),
    [saving, setSaving] = useState(false);
  const editing = !!row;
  useEffect(() => {
    if (dirty && !readOnly) workspace?.keepDraft(draftKey, { values, reason, effectiveDate });
  }, [values, reason, effectiveDate, dirty, readOnly, draftKey, workspace?.keepDraft]);
  function close() {
    if (dirty) toast.info('Borrador conservado. Abre este formulario para continuar.');
    onClose();
  }
  function discard() {
    if (window.confirm('¿Descartar los cambios de este formulario?')) {
      workspace?.clearDraft(draftKey);
      onClose();
    }
  }

  useEffect(() => {
    if (editing || !fields.some((f) => f.name === 'USU_ID_CREA')) return;
    let live = true;
    api('/lookups/ERP_USUARIO')
      .then((r) => {
        if (live && r.options.length === 1 && !r.hasMore)
          setValues((v) => (v.USU_ID_CREA ? v : { ...v, USU_ID_CREA: r.options[0].value }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, editing, table.name]);
  function update(name, value) {
    setDirty(true);
    setValues((v) => ({
      ...v,
      [name]: value,
      ...(name === 'NOM_ID' ? { RLA_ID: '' } : name === 'NOD_ID' ? { CBE_ID: '' } : {}),
      ...(['EMP_ID', 'EML_ID'].includes(name) && ['NOM_RELACION_LABORAL'].includes(table.name)
        ? { SUC_ID: '', DPT_ID: '' }
        : {}),
    }));
    setErrors((e) => ({ ...e, [name]: undefined, _form: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    event.stopPropagation();
    const input = { ...values };
    for (const f of fields)
      if (!editing && f.default === 'SYSTIMESTAMP' && !input[f.name]) delete input[f.name];
    const result = validatePayload(table, input, { create: !editing });
    setErrors(result.errors);
    if (Object.keys(result.errors).length) {
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setSaving(true);
    try {
      const saved = await api(`/${table.slug}${editing ? '/' + row[table.pk] : ''}`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(result.data),
        headers: editing
          ? { 'X-Change-Reason': encodeURIComponent(reason), 'X-Effective-Date': effectiveDate }
          : {},
      });
      workspace?.clearDraft(draftKey);
      setDirty(false);
      toast.success(editing ? 'Cambios guardados.' : 'Registro creado.');
      onSaved(saved);
    } catch (error) {
      setErrors({ ...error.fields, _form: error.message });
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) close();
      }}
    >
      <DialogContent
        className="max-w-5xl"
        onEscapeKeyDown={(e) => {
          if (saving) e.preventDefault();
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="border-b px-6 py-5 pr-14">
          <DialogTitle className="text-2xl font-bold">
            {readOnly ? 'Consultar' : editing ? 'Editar' : 'Agregar'} · {table.title}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {readOnly ? 'Detalle del registro.' : 'Los campos con * son obligatorios.'}
          </DialogDescription>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="overflow-y-auto px-6 py-5">
            <h3 className="mb-5 text-lg font-semibold text-primary">Información general</h3>
            {table.description && (
              <p className="mb-5 text-sm text-muted-foreground">{table.description}</p>
            )}
            {errors._form && (
              <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-destructive">
                {errors._form}
              </p>
            )}
            {recovered.current && (
              <p className="notice">
                Retomaste un borrador de esta sesión. Revisa los datos antes de guardarlos.
              </p>
            )}
            <FormFields
              table={table}
              values={values}
              update={update}
              errors={errors}
              api={api}
              readOnly={saving || readOnly}
              editing={editing}
            />
            {editing && !readOnly && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label>
                  Motivo del cambio
                  <input
                    className="control w-full"
                    maxLength={500}
                    value={reason}
                    onChange={(e) => {
                      setDirty(true);
                      setReason(e.target.value);
                    }}
                    placeholder="Explica la corrección o actualización"
                  />
                </label>
                <label>
                  Fecha efectiva
                  <input
                    className="control w-full"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => {
                      setDirty(true);
                      setEffectiveDate(e.target.value);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t bg-white px-6 py-4">
            <Button type="button" variant="outline" disabled={saving} onClick={close}>
              {readOnly ? 'Cerrar' : dirty ? 'Cerrar y conservar borrador' : 'Cancelar'}
            </Button>
            {dirty && !readOnly && (
              <Button type="button" variant="ghost" disabled={saving} onClick={discard}>
                Descartar borrador
              </Button>
            )}
            {!readOnly && (
              <Button type="submit" disabled={saving}>
                <Save />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
