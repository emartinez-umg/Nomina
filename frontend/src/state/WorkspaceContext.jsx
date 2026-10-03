import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { businessRules } from '../../../shared/business-rules.js';
import { readDrafts, writeDraft } from './draft-storage';
const Context = createContext(null);
export function WorkspaceProvider({ children, scope = 'local' }) {
  const [company, setCompany] = useState(() => {
    try {
      return (
        new URLSearchParams(location.search).get('company') ||
        localStorage.getItem(`nomina.company:${scope}`) ||
        ''
      );
    } catch {
      return '';
    }
  });
  const drafts = useRef(null);
  if (!drafts.current) {
    try {
      drafts.current = readDrafts(localStorage, scope);
    } catch {
      drafts.current = new Map();
    }
  }
  const views = useRef(new Map());
  const pending = useRef(new Map());
  const timer = useRef(null);
  const [draftVersion, changed] = useState(0);
  const [draftStatus, setDraftStatus] = useState('');
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    try {
      for (const [key, value] of pending.current) writeDraft(localStorage, scope, key, value);
      pending.current.clear();
      setDraftStatus('Borrador guardado en este navegador');
    } catch {
      setDraftStatus(
        'No se pudo guardar el borrador en este navegador. Mantén esta pestaña abierta.',
      );
    }
  }, [scope]);
  useEffect(() => {
    try {
      localStorage.setItem(`nomina.company:${scope}`, company);
    } catch {
      /* Storage unavailable. */
    }
  }, [company, scope]);
  useEffect(() => {
    const protect = (event) => {
      if (pending.current.size) flush();
      if (pending.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const hide = () => {
      if (document.visibilityState === 'hidden' && pending.current.size) flush();
    };
    window.addEventListener('beforeunload', protect);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('beforeunload', protect);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hide);
      if (pending.current.size) flush();
      clearTimeout(timer.current);
    };
  }, [flush]);
  const keepDraft = useCallback(
    (key, value) => {
      const draft = { ...value, savedAt: Date.now() };
      drafts.current.set(key, draft);
      pending.current.set(key, draft);
      setDraftStatus('Guardando borrador…');
      changed((v) => v + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, businessRules.draftDelayMs);
    },
    [flush],
  );
  const clearDraft = useCallback(
    (key) => {
      drafts.current.delete(key);
      pending.current.set(key, null);
      flush();
      changed((v) => v + 1);
      setDraftStatus('');
    },
    [flush],
  );
  return (
    <Context.Provider
      value={{
        company,
        setCompany,
        drafts: drafts.current,
        views: views.current,
        draftVersion,
        draftStatus,
        keepDraft,
        clearDraft,
        scope,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
