import { useWorkspace } from '../state/WorkspaceContext';
import { companyScoped, stateOptions } from '../../../shared/workflow.js';
import { friendlyOptions } from '../../../shared/hr-catalog.js';
import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  Power,
  RefreshCw,
  Columns3,
  FolderOpen,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../components/ui/alert-dialog';
import { ForeignKeySelect } from '../components/ForeignKeySelect';
import { RecordForm } from '../components/RecordForm';
function renderValue(row, f) {
  const v = row[f.name];
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  if (friendlyOptions[f.name]?.[v]) return friendlyOptions[f.name][v];
  if (f.ref) return row['__LABEL_' + f.name] || 'Referencia no disponible';
  if (f.boolean)
    return (
      <span className={`status ${String(v) === '1' ? 'positive' : 'muted'}`}>
        {/_ACTIV[OA]$/.test(f.name)
          ? String(v) === '1'
            ? 'Activo'
            : 'Inactivo'
          : String(v) === '1'
            ? 'Sí'
            : 'No'}
      </span>
    );
  if (f.name.endsWith('_ESTADO'))
    return (
      <span
        className={`status ${/ANUL|FINALIZ|CERRAD/.test(v) ? 'muted' : /PAGAD|APROBAD|ACTIVA/.test(v) ? 'positive' : 'pending'}`}
      >
        {v.replaceAll('_', ' ')}
      </span>
    );
  if (f.type === 'DATE') return String(v).split('-').reverse().join('/');
  if (f.type === 'TIMESTAMP') {
    const [date, time] = v.split('T');
    return `${date.split('-').reverse().join('/')} ${time.slice(0, 8)}`;
  }
  return String(v);
}
export function EntityPage({ table, api, go }) {
  const workspace = useWorkspace();
  const urlParams = new URLSearchParams(location.search);
  const initialField =
    table.fields.find((f) => f.name === urlParams.get('filterField'))?.name || '';
  const initialValue = initialField ? urlParams.get('filterValue') || '' : '';
  const initialValues = Object.fromEntries(
    table.fields
      .filter((f) => !f.identity && urlParams.has(f.name))
      .map((f) => [f.name, urlParams.get(f.name)]),
  );
  if (initialField && !initialField.endsWith('_ESTADO')) initialValues[initialField] = initialValue;
  if (workspace.company && table.fields.some((f) => f.name === 'EMP_ID' && !f.identity))
    initialValues.EMP_ID = workspace.company;
  const company = companyScoped(table) ? workspace.company : '';
  const viewKey = table.slug + ':' + company + ':' + location.search;
  const saved = workspace.views.get(viewKey) || {};
  const [data, setData] = useState({ rows: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [query, setQuery] = useState(saved.query ?? ''),
    [page, setPage] = useState(saved.page ?? 1),
    [size, setSize] = useState(saved.size ?? 20),
    [sort, setSort] = useState(saved.sort ?? table.pk),
    [direction, setDirection] = useState(saved.direction ?? 'asc'),
    [revision, setRevision] = useState(0),
    [modal, setModal] = useState(
      urlParams.get('nuevo') === '1' ? { row: null, readOnly: false } : null,
    ),
    [confirm, setConfirm] = useState(null),
    [deleting, setDeleting] = useState(false),
    [detailLoading, setDetailLoading] = useState(null),
    [filterField, setFilterField] = useState(saved.filterField ?? initialField),
    [filterValue, setFilterValue] = useState(saved.filterValue ?? initialValue);
  const initial = table.fields
    .filter((f) => !f.identity)
    .slice(0, 6)
    .map((f) => f.name);
  const state = table.fields.find((f) => /_ESTADO$|_ACTIV[OA]$/.test(f.name));
  if (state && !initial.includes(state.name)) initial.push(state.name);
  const [visible, setVisible] = useState(saved.visible ?? initial),
    [columnsOpen, setColumnsOpen] = useState(false);
  const [dateField, setDateField] = useState(saved.dateField || ''),
    [from, setFrom] = useState(saved.from || ''),
    [to, setTo] = useState(saved.to || ''),
    [extraFilters, setExtraFilters] = useState(saved.extraFilters || []),
    [exporting, setExporting] = useState(false);
  useEffect(() => {
    workspace.views.set(viewKey, {
      query,
      page,
      size,
      sort,
      direction,
      filterField,
      filterValue,
      visible,
      dateField,
      from,
      to,
      extraFilters,
    });
  }, [
    viewKey,
    query,
    page,
    size,
    sort,
    direction,
    filterField,
    filterValue,
    visible,
    dateField,
    from,
    to,
    extraFilters,
  ]);
  function requestParams() {
    const params = new URLSearchParams({ page, pageSize: size, sort, direction, q: query });
    if (company) params.set('company', company);
    if (urlParams.get('pending')) params.set('pending', urlParams.get('pending'));
    if (urlParams.get('employee')) params.set('employee', urlParams.get('employee'));
    if (filterField && filterValue !== '') {
      params.set('filterField', filterField);
      params.set('filterValue', filterValue);
    }
    extraFilters.forEach((f) => params.set('filter_' + f.field, f.value));
    if (dateField) {
      params.set('dateField', dateField);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    return params;
  }
  async function exportRows() {
    setExporting(true);
    try {
      const params = requestParams();
      params.set('columns', visible.join(','));
      const file = await api(`/${table.slug}/exportar?${params}`);
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${file.total} registros exportados.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      const params = requestParams();
      api(`/${table.slug}?${params}`, { signal: c.signal })
        .then((r) => {
          if (page > 1 && r.rows.length === 0 && r.total > 0) {
            setPage(Math.ceil(r.total / size));
            return;
          }
          if (page > 1 && r.total === 0) {
            setPage(1);
            return;
          }
          setData(r);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [
    api,
    table.slug,
    query,
    page,
    size,
    sort,
    direction,
    revision,
    filterField,
    filterValue,
    company,
    dateField,
    from,
    to,
    extraFilters,
  ]);
  async function openRow(row, readOnly) {
    setDetailLoading(row[table.pk]);
    try {
      const full = await api(`/${table.slug}/${row[table.pk]}`);
      setModal({ row: full, readOnly });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDetailLoading(null);
    }
  }
  async function remove(event) {
    event.preventDefault();
    setDeleting(true);
    try {
      await api(`/${table.slug}/${confirm[table.pk]}`, { method: 'DELETE' });
      toast.success(
        table.lifecycle.mode === 'delete'
          ? 'Registro eliminado.'
          : table.lifecycle.mode === 'inactive'
            ? 'Registro inactivado.'
            : 'Registro anulado.',
      );
      setConfirm(null);
      setRevision((r) => r + 1);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  }
  const pageCount = Math.max(1, Math.ceil(data.total / size)),
    columns = table.fields.filter((f) => visible.includes(f.name)),
    filter = table.fields.find((f) => f.name === filterField);
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{table.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {table.description || 'Consulta, registra y actualiza la información.'}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-3 md:w-auto">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-3 text-muted-foreground" size={17} />
            <Input
              aria-label={`Buscar en ${table.title}`}
              placeholder="Buscar registros…"
              className="pl-9"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {table.name === 'NOM_EMPLEADO' && (
            <Button onClick={() => go('alta-empleado')}>
              <Plus /> Contratar empleado
            </Button>
          )}
          <Button
            variant={table.name === 'NOM_EMPLEADO' ? 'outline' : 'default'}
            onClick={() => setModal({ row: null, readOnly: false })}
          >
            <Plus />
            {table.name === 'NOM_EMPLEADO' ? 'Solo ficha de empleado' : 'Agregar registro'}
          </Button>
        </div>
      </div>
      {urlParams.get('pending') && (
        <p className="notice mt-3">
          Expedientes por revisar: relación, banco, documento, contacto, emergencia, dirección,
          jornada o tipo de contrato.{' '}
          <button className="underline" onClick={() => go('empleado')}>
            Ver todos los empleados
          </button>
        </p>
      )}
      {company && (
        <p className="mt-3 text-sm text-primary">
          Vista limitada a la empresa de trabajo.{' '}
          <button className="underline" onClick={() => workspace.setCompany('')}>
            Ver todas las empresas
          </button>
        </p>
      )}
      <div className="my-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="filter-field" className="mb-1 block text-xs text-muted-foreground">
            Filtrar por
          </label>
          <select
            id="filter-field"
            className="control"
            value={filterField}
            onChange={(e) => {
              setFilterField(e.target.value);
              setFilterValue('');
              setPage(1);
            }}
          >
            <option value="">Sin filtro</option>
            {table.fields
              .filter(
                (f) => stateOptions(f) || f.boolean || f.ref || f.identity || f.type === 'DATE',
              )
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
          </select>
        </div>
        {filter && (
          <div>
            <label htmlFor="filter-value" className="mb-1 block text-xs text-muted-foreground">
              {filter.label}
            </label>
            {filter.ref ? (
              <ForeignKeySelect
                id="filter-value"
                field={filter}
                value={filterValue}
                onChange={(v) => {
                  setFilterValue(v);
                  setPage(1);
                }}
                api={api}
              />
            ) : filter.identity ? (
              <Input
                id="filter-value"
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPage(1);
                }}
              />
            ) : filter.type === 'DATE' ? (
              <Input
                id="filter-value"
                type="date"
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPage(1);
                }}
              />
            ) : (
              <select
                id="filter-value"
                className="control"
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {(stateOptions(filter) || ['0', '1']).map((v) => (
                  <option key={v} value={v}>
                    {filter.boolean ? (v === '1' ? 'Sí / activo' : 'No / inactivo') : v}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setQuery('');
            setFilterField('');
            setFilterValue('');
            setPage(1);
            setExtraFilters([]);
            setDateField('');
            setFrom('');
            setTo('');
          }}
          disabled={!query && !filterField && !extraFilters.length && !dateField}
        >
          Limpiar
        </Button>
        {filterField && filterValue && (
          <Button
            variant="outline"
            onClick={() => {
              setExtraFilters((fs) => [
                ...fs.filter((f) => f.field !== filterField),
                { field: filterField, value: filterValue },
              ]);
              setFilterField('');
              setFilterValue('');
              setPage(1);
            }}
          >
            Añadir filtro
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            disabled={exporting || loading || !!error || !data.total}
            onClick={exportRows}
          >
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setRevision((r) => r + 1)}
            disabled={loading}
            aria-label="Actualizar listado"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button
            variant="outline"
            aria-expanded={columnsOpen}
            onClick={() => setColumnsOpen(!columnsOpen)}
          >
            <Columns3 />
            Columnas
          </Button>
        </div>
      </div>
      {extraFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {extraFilters.map((f) => (
            <button
              className="status"
              key={f.field}
              onClick={() => {
                setExtraFilters((fs) => fs.filter((x) => x.field !== f.field));
                setPage(1);
              }}
            >
              {table.fields.find((x) => x.name === f.field)?.label}: {f.value} ×
            </button>
          ))}
        </div>
      )}
      {table.fields.some((f) => ['DATE', 'TIMESTAMP'].includes(f.type)) && (
        <div className="flex flex-wrap gap-3 mb-5">
          <label>
            Rango de fechas
            <select
              className="control ml-2"
              value={dateField}
              onChange={(e) => {
                setDateField(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Sin rango</option>
              {table.fields
                .filter((f) => ['DATE', 'TIMESTAMP'].includes(f.type))
                .map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label}
                  </option>
                ))}
            </select>
          </label>
          {dateField && (
            <>
              <label>
                Desde
                <input
                  className="control ml-2"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Hasta
                <input
                  className="control ml-2"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </>
          )}
        </div>
      )}
      {columnsOpen && (
        <fieldset className="mb-5 grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-3">
          <legend className="px-2 text-sm font-semibold">Columnas visibles</legend>
          {table.fields.map((f) => (
            <label key={f.name} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={visible.includes(f.name)}
                disabled={visible.length === 1 && visible[0] === f.name}
                onChange={(e) =>
                  setVisible((v) =>
                    e.target.checked ? [...v, f.name] : v.filter((n) => n !== f.name),
                  )
                }
              />
              {f.label}
            </label>
          ))}
        </fieldset>
      )}
      {error ? (
        <div
          role="alert"
          className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 p-6 text-center"
        >
          <p className="max-w-xl text-destructive">{error}</p>
          <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
            Reintentar
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((f) => (
                <TableHead
                  key={f.name}
                  aria-sort={
                    sort === f.name ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 py-3 text-left"
                    onClick={() => {
                      setSort(f.name);
                      setDirection(sort === f.name && direction === 'asc' ? 'desc' : 'asc');
                      setPage(1);
                    }}
                  >
                    {f.label}
                    <ArrowUpDown
                      size={13}
                      className={sort === f.name ? 'text-primary' : 'text-slate-400'}
                    />
                  </button>
                </TableHead>
              ))}
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1}>
                  <div
                    role="status"
                    className="flex min-h-60 items-center justify-center gap-3 text-muted-foreground"
                  >
                    <RefreshCw className="animate-spin" size={20} />
                    Cargando registros…
                  </div>
                </TableCell>
              </TableRow>
            ) : data.rows.length ? (
              data.rows.map((row) => (
                <TableRow key={row[table.pk]}>
                  {columns.map((f) => (
                    <TableCell key={f.name}>
                      <div className="min-w-20 break-words">{renderValue(row, f)}</div>
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-1">
                      {{
                        NOM_NOMINA: 'planilla',
                        NOM_VACACION: 'vacacion',
                        NOM_RELACION_LABORAL: 'baja',
                        NOM_LIQUIDACION_LABORAL: 'liquidacion',
                      }[table.name] && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            go('revision', {
                              tipo: {
                                NOM_NOMINA: 'planilla',
                                NOM_VACACION: 'vacacion',
                                NOM_RELACION_LABORAL: 'baja',
                                NOM_LIQUIDACION_LABORAL: 'liquidacion',
                              }[table.name],
                              id: row[table.pk],
                            })
                          }
                        >
                          {table.name === 'NOM_RELACION_LABORAL' ? 'Registrar baja' : 'Revisar'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          go('revision', {
                            tipo: 'historial',
                            entidad: table.name,
                            id: row[table.pk],
                          })
                        }
                      >
                        Historial
                      </Button>
                      {table.name === 'NOM_EMPLEADO' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => go('expediente', { empleado: row.EML_ID })}
                        >
                          Expediente
                        </Button>
                      )}
                      {table.name === 'ERP_PERSONA' && row.PER_TIPO === 'F' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => go('alta-empleado', { persona: row.PER_ID })}
                        >
                          Contratar
                        </Button>
                      )}
                      {table.name === 'NOM_NOMINA' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            go('nomina-detalle', { filterField: 'NOM_ID', filterValue: row.NOM_ID })
                          }
                        >
                          Detalles
                        </Button>
                      )}
                      {table.name === 'NOM_PRESTAMO' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            go('prestamo-cuota', { filterField: 'NPR_ID', filterValue: row.NPR_ID })
                          }
                        >
                          Cuotas
                        </Button>
                      )}
                      {table.name === 'NOM_JORNADA' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            go('jornada-detalle', {
                              filterField: 'JOR_ID',
                              filterValue: row.JOR_ID,
                            })
                          }
                        >
                          Horarios
                        </Button>
                      )}
                      {table.name === 'NOM_NOMINA_DETALLE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            go('nomina-concepto', {
                              filterField: 'NOD_ID',
                              filterValue: row.NOD_ID,
                            })
                          }
                        >
                          Conceptos
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Consultar registro"
                        aria-label={`Consultar registro ${row[table.pk]}`}
                        disabled={detailLoading !== null}
                        onClick={() => openRow(row, true)}
                      >
                        <Eye className="text-blue-600" />
                      </Button>
                      {!(
                        (table.name === 'NOM_NOMINA' && row.NOM_ESTADO !== 'BORRADOR') ||
                        (table.name === 'NOM_VACACION' && row.VAC_ESTADO !== 'SOLICITADA') ||
                        (table.name === 'NOM_RELACION_LABORAL' &&
                          row.RLA_ESTADO === 'FINALIZADA') ||
                        (table.name === 'NOM_TRANSFERENCIA_PAGO' && row.TRP_ESTADO === 'CONFIRMADA')
                      ) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar registro"
                          aria-label={`Editar registro ${row[table.pk]}`}
                          disabled={detailLoading !== null}
                          onClick={() => openRow(row, false)}
                        >
                          <Pencil className="text-amber-700" />
                        </Button>
                      )}
                      {table.lifecycle.mode !== 'state' &&
                        !['NOM_NOMINA', 'NOM_VACACION'].includes(table.name) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={table.lifecycle.label}
                            aria-label={`${table.lifecycle.label} registro ${row[table.pk]}`}
                            disabled={
                              table.lifecycle.field &&
                              String(row[table.lifecycle.field]) === table.lifecycle.value
                            }
                            onClick={() => setConfirm(row)}
                          >
                            {table.lifecycle.mode === 'inactive' ? (
                              <Power className="text-destructive" />
                            ) : table.lifecycle.mode === 'cancel' ? (
                              <Ban className="text-destructive" />
                            ) : (
                              <Trash2 className="text-destructive" />
                            )}
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length + 1}>
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                    <FolderOpen size={36} strokeWidth={1.4} className="text-muted-foreground" />
                    <p className="font-semibold">
                      {query || filterValue
                        ? 'No hay resultados para estos filtros.'
                        : 'Todavía no hay registros.'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {query || filterValue
                        ? 'Prueba otra búsqueda o limpia los filtros.'
                        : 'Agrega el primer registro para comenzar.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm">
        <p aria-live="polite" className="text-muted-foreground">
          {loading
            ? 'Consultando…'
            : error
              ? 'Listado no disponible'
              : `${data.total === 0 ? 0 : (page - 1) * size + 1}–${Math.min(page * size, data.total)} de ${data.total} registros`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            Por página
            <select
              aria-label="Registros por página"
              className="control"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <nav aria-label="Paginación" className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Página anterior"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft />
            </Button>
            <span>
              {page} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Página siguiente"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight />
            </Button>
          </nav>
        </div>
      </div>
      {modal && (
        <RecordForm
          key={modal.row?.[table.pk] || 'new'}
          table={table}
          row={modal.row}
          initialValues={{
            ...initialValues,
            ...(filterField && filterValue && !filterField.endsWith('_ESTADO')
              ? { [filterField]: filterValue }
              : {}),
          }}
          readOnly={modal.readOnly}
          api={api}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle className="text-xl font-bold">
            {table.lifecycle.label} registro
          </AlertDialogTitle>
          <AlertDialogDescription className="my-4 text-sm leading-relaxed text-muted-foreground">
            {table.lifecycle.mode === 'delete'
              ? 'El registro se eliminará permanentemente. Si tiene registros relacionados, la base de datos impedirá el borrado.'
              : table.lifecycle.mode === 'inactive'
                ? 'El registro quedará inactivo y conservará su información. Puedes reactivarlo desde la edición.'
                : `El registro pasará al estado ${table.lifecycle.value}. Su información se conservará.`}
          </AlertDialogDescription>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={remove}>
              {deleting ? 'Procesando…' : table.lifecycle.label}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
