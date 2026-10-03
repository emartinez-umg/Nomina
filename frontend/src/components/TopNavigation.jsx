import { useWorkspace } from '../state/WorkspaceContext';
import { canOpenPage, roles } from '../../../shared/access.js';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, BookOpen, Check, Command, Search, UserPlus, X } from 'lucide-react';
import erpLogo from '../assets/erp-logo.png';
import { primaryPages, searchCommands, moduleKeywords } from './navigation';
import './navigation.css';
import { NavigationMenus } from './NavigationMenus';

export function TopNavigation({ tables, groups, route, basePath, go, embedded, role }) {
  const workspace = useWorkspace();
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nomina.recent:' + workspace.scope) || '[]');
    } catch {
      return [];
    }
  });
  useEffect(() => {
    setRecent((old) => {
      const next = [route.slug, ...old.filter((s) => s !== route.slug)].slice(0, 8);
      try {
        localStorage.setItem('nomina.recent:' + workspace.scope, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [route.slug, workspace.scope]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [active, setActive] = useState(0);
  const [shortcut, setShortcut] = useState('Ctrl K');
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const commands = useMemo(
    () => [
      ...primaryPages
        .filter((page) => !role || canOpenPage(role, page.slug, tables))
        .map((page) => ({ ...page, groupLabel: 'Accesos rápidos' })),
      ...tables.map((table) => ({
        slug: table.slug,
        title: table.title,
        keywords: moduleKeywords[table.slug],
        group: table.group,
        groupLabel: groups.find((item) => item.id === table.group)?.label || 'Nómina',
      })),
    ],
    [tables, groups, role],
  );
  const results = useMemo(() => {
    const results = searchCommands(commands, query, group);
    if (query || group) return results;
    return results.sort(
      (a, b) =>
        (recent.includes(a.slug) ? recent.indexOf(a.slug) : 99) -
        (recent.includes(b.slug) ? recent.indexOf(b.slug) : 99),
    );
  }, [commands, query, group, recent]);

  function changeOpen(value) {
    setOpen(value);
    if (value) {
      setQuery('');
      setGroup('');
      setActive(0);
    }
  }
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
    function handleKey(event) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.isComposing
      ) {
        // Do not cover an active record form or its unsaved data with navigation.
        if (
          document.querySelector(
            '[role="dialog"]:not([data-command-palette]), [role="alertdialog"]',
          )
        )
          return;
        event.preventDefault();
        if (!event.repeat) changeOpen(!open);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [route.slug, route.search]);
  useEffect(() => {
    if (open)
      listRef.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, open, results]);

  function navigate(event, slug) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    go(slug);
  }
  function choose(command) {
    changeOpen(false);
    go(command.slug, command.params || {});
  }
  function move(event) {
    if (event.nativeEvent.isComposing) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (results.length)
        setActive(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length,
        );
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <header className={`workspace-header ${embedded ? 'workspace-header--embedded' : ''}`}>
        <div className="workspace-bar">
          <a
            className="workspace-brand"
            href={`${basePath}/dashboard`}
            onClick={(event) => navigate(event, 'dashboard')}
            aria-label="Nómina · Inicio"
          >
            <img src={erpLogo} alt="" width="38" height="38" />
            <span>
              <strong>Nómina</strong>
              <small>ERP universitario</small>
            </span>
          </a>
          <span className="workspace-divider" aria-hidden="true">
            /
          </span>
          <span className="workspace-label">Recursos Humanos</span>
          <div className="workspace-actions">
            <a
              className="workspace-help"
              href={`${basePath}/guia`}
              onClick={(event) => navigate(event, 'guia')}
              aria-label="Guía de uso"
              title="Guía de uso"
              aria-current={route.slug === 'guia' ? 'page' : undefined}
            >
              <BookOpen size={18} aria-hidden="true" />
            </a>
            <Dialog.Trigger asChild>
              <button
                ref={triggerRef}
                type="button"
                className="command-trigger"
                aria-label="Buscar secciones y acciones"
              >
                <Search size={17} aria-hidden="true" />
                <span>Buscar secciones…</span>
                <kbd>{shortcut}</kbd>
              </button>
            </Dialog.Trigger>
            {role !== roles.EMPLOYEE && (
              <a
                className="workspace-create"
                href={`${basePath}/alta-empleado`}
                onClick={(event) => navigate(event, 'alta-empleado')}
                aria-label="Contratar empleado"
              >
                <UserPlus size={17} aria-hidden="true" />
                <span>Contratar</span>
              </a>
            )}
          </div>
        </div>
        {role === roles.EMPLOYEE ? (
          <nav className="flex flex-wrap gap-4 px-5 py-3">
            {[
              ['mi-informacion', 'Mi información'],
              ['calendario', 'Calendario'],
              ['recomendaciones', 'Recomendaciones'],
            ].map(([slug, title]) => (
              <a key={slug} href={`${basePath}/${slug}`} onClick={(event) => navigate(event, slug)}>
                {title}
              </a>
            ))}
          </nav>
        ) : (
          <NavigationMenus
            tables={tables}
            groups={groups}
            route={route}
            basePath={basePath}
            navigate={navigate}
            paletteOpen={open}
          />
        )}
      </header>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content
          data-command-palette
          className="command-panel"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Buscar secciones y acciones</Dialog.Title>
          <Dialog.Description className="sr-only">
            Busca una sección de Nómina. Usa las flechas para elegir, Enter para abrir y Escape para
            cerrar.
          </Dialog.Description>
          <div className="command-search">
            <Search size={21} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={move}
              placeholder="¿A dónde quieres ir?"
              aria-label="Buscar una sección"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={
                results[active]
                  ? `${listId}-${results[active].id || results[active].slug}`
                  : undefined
              }
              autoComplete="off"
              spellCheck="false"
            />
            <Dialog.Close className="command-close" aria-label="Cerrar búsqueda">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="command-filter">
            <label htmlFor={`${listId}-group`}>Explorar</label>
            <select
              id={`${listId}-group`}
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setActive(0);
              }}
            >
              <option value="">Todas las secciones</option>
              <option value="general">Accesos rápidos</option>
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div
            className="command-results"
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Secciones disponibles"
          >
            {results.map((command, index) => (
              <div key={command.id || command.slug} role="presentation">
                {results[index - 1]?.group !== command.group && (
                  <div className="command-group" role="presentation">
                    {command.groupLabel}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={`${listId}-${command.id || command.slug}`}
                  data-index={index}
                  aria-selected={index === active}
                  className="command-result"
                  onPointerMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(command)}
                >
                  <span className="command-result-icon">
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                  <span className="command-result-copy">
                    <strong>{command.title}</strong>
                    <small>{command.groupLabel}</small>
                  </span>
                  {route.slug === command.slug && (
                    <span className="command-current">
                      <Check size={14} aria-hidden="true" />
                      Actual
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
          {!results.length && (
            <div className="command-empty">
              <Search size={26} aria-hidden="true" />
              <strong>No encontramos esa sección</strong>
              <p>Prueba con «empleados», «vacaciones» o «bancos».</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setGroup('');
                  setActive(0);
                  inputRef.current?.focus();
                }}
              >
                Ver todas las secciones
              </button>
            </div>
          )}
          <div className="command-footer">
            <span role="status" aria-live="polite">
              {results.length} secciones
            </span>
            <span className="command-key-help">
              <kbd>↑</kbd>
              <kbd>↓</kbd> elegir <kbd>↵</kbd> abrir <kbd>esc</kbd> cerrar
            </span>
            <Command size={15} aria-hidden="true" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
