import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
const Context = createContext(null);
export function WorkspaceProvider({ children }) {
  const [company, setCompany] = useState(() => {
    try {
      return (
        new URLSearchParams(location.search).get('company') ||
        sessionStorage.getItem('nomina.company') ||
        ''
      );
    } catch {
      return '';
    }
  });
  const drafts = useRef(new Map());
  const views = useRef(new Map());
  const [draftVersion, changed] = useState(0);
  useEffect(() => {
    try {
      sessionStorage.setItem('nomina.company', company);
    } catch {
      /* Private storage disabled. */
    }
  }, [company]);
  useEffect(() => {
    const protect = (event) => {
      if (drafts.current.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  const keepDraft = useCallback((key, value) => {
    drafts.current.set(key, value);
    changed((v) => v + 1);
  }, []);
  const clearDraft = useCallback((key) => {
    if (drafts.current.delete(key)) changed((v) => v + 1);
  }, []);
  return (
    <Context.Provider
      value={{
        company,
        setCompany,
        drafts: drafts.current,
        views: views.current,
        draftVersion,
        keepDraft,
        clearDraft,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
