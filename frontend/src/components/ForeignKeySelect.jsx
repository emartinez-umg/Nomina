import { useEffect, useId, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
// Server-paginated combobox: never truncates a large ERP catalog to a fixed initial list.
export function ForeignKeySelect({
  field,
  value,
  onChange,
  api,
  disabled,
  id,
  invalid,
  describedBy,
  filters = {},
  onCreate,
}) {
  const filterQuery = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k === '__company' ? 'company' : 'filter_' + k, v]),
  ).toString();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [items, setItems] = useState([]),
    [more, setMore] = useState(false),
    [label, setLabel] = useState(''),
    [labelFailed, setLabelFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    listId = useId();
  useEffect(() => {
    if (!value) {
      setLabel('');
      return;
    }
    const ctrl = new AbortController();
    setLabel('Cargando selección…');
    setLabelFailed(false);
    api(`/lookups/${field.ref.table}?id=${encodeURIComponent(value)}`, { signal: ctrl.signal })
      .then((r) => setLabel(r.options[0]?.label || 'Referencia no disponible'))
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setLabel('No se pudo cargar la referencia');
          setLabelFailed(true);
        }
      });
    return () => ctrl.abort();
  }, [value, field.ref.table, api, retry]);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      api(
        `/lookups/${field.ref.table}?q=${encodeURIComponent(query)}&page=${page}&${filterQuery}`,
        {
          signal: ctrl.signal,
        },
      )
        .then((r) => {
          setItems(r.options);
          setMore(r.hasMore);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query, page, field.ref.table, api, filterQuery, retry]);
  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setPage(1);
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 py-2 text-left text-sm focus-visible:ring-2 aria-invalid:border-destructive disabled:opacity-60"
      >
        <span className="min-w-0 break-words">{label || 'Seleccionar…'}</span>
        <ChevronDown size={16} className="shrink-0" />
      </button>
      {labelFailed && (
        <button
          type="button"
          onClick={() => setRetry((r) => r + 1)}
          className="mt-2 text-sm text-destructive underline"
        >
          Reintentar selección
        </button>
      )}
      {onCreate && (
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-primary underline underline-offset-2"
          onClick={() => {
            setOpen(false);
            onCreate();
          }}
        >
          + Crear {field.label.toLowerCase()}
        </button>
      )}
      {open && (
        <div
          className="relative z-10 mt-2 rounded-lg border bg-white p-2 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              document.getElementById(id)?.focus();
            }
          }}
        >
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3" />
            <Input
              autoFocus
              aria-label={`Buscar ${field.label.toLowerCase()}`}
              placeholder={`Escribe para buscar ${field.label.toLowerCase()}`}
              className="pl-9"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div
            role="listbox"
            aria-label={field.label}
            id={listId}
            className="my-2 max-h-48 overflow-auto"
            onKeyDown={(e) => {
              const nodes = [...e.currentTarget.querySelectorAll('[role=option]')];
              let index = nodes.indexOf(document.activeElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                index =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? nodes.length - 1
                      : e.key === 'ArrowDown'
                        ? Math.min(index + 1, nodes.length - 1)
                        : Math.max(index - 1, 0);
                nodes[index]?.focus();
              }
            }}
          >
            {!field.required && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className="option"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                Sin asignar
              </button>
            )}
            {loading ? (
              <p className="p-2 text-sm" role="status">
                Buscando…
              </p>
            ) : error ? (
              <div role="alert" className="p-2 text-sm text-destructive">
                {error}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => setRetry((r) => r + 1)}
                >
                  Reintentar
                </button>
              </div>
            ) : items.length ? (
              items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={String(value) === String(item.value)}
                  className="option"
                  onClick={() => {
                    setLabel(item.label);
                    setLabelFailed(false);
                    onChange(String(item.value));
                    setOpen(false);
                    document.getElementById(id)?.focus();
                  }}
                >
                  <span>{item.label}</span>
                  {String(value) === String(item.value) && <Check size={16} />}
                </button>
              ))
            ) : (
              <p className="p-2 text-sm text-muted-foreground">No se encontraron opciones.</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="text-sm">{page}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!more || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
