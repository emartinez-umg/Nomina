import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Grid2X2,
  LayoutDashboard,
  ShoppingBag,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { navigationMenus } from './navigation';

const icons = {
  personal: Users,
  planillas: Wallet,
  asistencia: CalendarDays,
  movimientos: ShoppingBag,
  catalogos: Grid2X2,
};

export function NavigationMenus({ tables, groups, route, basePath, navigate, paletteOpen }) {
  const [menu, setMenu] = useState(null);
  const [bottom, setBottom] = useState(0);
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const triggers = useRef({});
  const closeTimer = useRef(null);
  const id = useId();
  const selected = navigationMenus.find((item) => item.id === menu);
  const currentGroup = tables.find((table) => table.slug === route.slug)?.group;

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }
  function close(restoreFocus = false) {
    cancelClose();
    if (restoreFocus) triggers.current[menu]?.focus();
    setMenu(null);
  }
  function show(value) {
    cancelClose();
    setMenu(value);
  }
  useEffect(() => {
    setMenu(null);
  }, [route.slug, route.search, paletteOpen]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    if (!menu) return;
    const measure = () => setBottom(containerRef.current.getBoundingClientRect().bottom);
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    function outside(event) {
      if (!containerRef.current?.contains(event.target)) close();
    }
    function escape(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);

  function openWithKeyboard(event, value) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    show(value);
    requestAnimationFrame(() => {
      const links = panelRef.current?.querySelectorAll('a');
      (event.key === 'ArrowUp' ? links?.[links.length - 1] : links?.[0])?.focus();
    });
  }
  function moveBetweenLinks(event) {
    if (!event.target.closest('a') || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const links = [...panelRef.current.querySelectorAll('a')];
    const index = links.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? links.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  }
  return (
    <div
      className="navigation-menus"
      ref={containerRef}
      onPointerEnter={cancelClose}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        cancelClose();
        closeTimer.current = setTimeout(() => {
          if (!containerRef.current?.contains(document.activeElement)) setMenu(null);
        }, 180);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <nav className="workspace-tabs" aria-label="Navegación de Nómina">
        <a
          href={`${basePath}/dashboard`}
          onClick={(event) => {
            close();
            navigate(event, 'dashboard');
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') close();
          }}
          aria-current={route.slug === 'dashboard' ? 'page' : undefined}
        >
          <LayoutDashboard size={16} aria-hidden="true" />
          Inicio
        </a>
        {navigationMenus.map((item) => {
          const Icon = icons[item.id];
          return (
            <button
              key={item.id}
              type="button"
              ref={(node) => {
                triggers.current[item.id] = node;
              }}
              id={`${id}-${item.id}`}
              aria-expanded={menu === item.id}
              aria-controls={`${id}-${item.id}-panel`}
              aria-current={item.groups.includes(currentGroup) ? 'location' : undefined}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse' && !paletteOpen && menu) show(item.id);
              }}
              onClick={() => (menu === item.id ? close() : show(item.id))}
              onKeyDown={(event) => openWithKeyboard(event, item.id)}
            >
              <Icon size={16} aria-hidden="true" />
              {item.title}
              <ChevronDown className="navigation-chevron" size={13} aria-hidden="true" />
            </button>
          );
        })}
      </nav>
      {selected && (
        <section
          ref={panelRef}
          className="navigation-dropdown"
          id={`${id}-${menu}-panel`}
          aria-labelledby={`${id}-${menu}`}
          style={{ '--navigation-bottom': `${Math.max(0, bottom)}px` }}
        >
          <div className="navigation-dropdown-heading">
            <strong>{selected.title}</strong>
            <button type="button" aria-label="Cerrar menú desplegable" onClick={() => close(true)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div
            className="navigation-groups"
            data-single={selected.groups.length === 1 || undefined}
            onKeyDown={moveBetweenLinks}
          >
            {selected.groups.map((groupId) => (
              <section
                key={groupId}
                className="navigation-group"
                aria-labelledby={`${id}-${groupId}-title`}
              >
                <h2 id={`${id}-${groupId}-title`}>
                  {groups.find((item) => item.id === groupId)?.label}
                </h2>
                <div className="navigation-links">
                  {tables
                    .filter((table) => table.group === groupId)
                    .map((table) => (
                      <a
                        key={table.slug}
                        href={`${basePath}/${table.slug}`}
                        aria-current={route.slug === table.slug ? 'page' : undefined}
                        onClick={(event) => {
                          close();
                          navigate(event, table.slug);
                        }}
                      >
                        <span>{table.title}</span>
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </a>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
