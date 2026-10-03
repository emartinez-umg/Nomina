export function createApi(
  baseUrl = import.meta.env?.VITE_NOM_API_BASE || '/api/nomina',
  fetcher = fetch,
  extraHeaders = {},
) {
  return async (path, { signal, ...options } = {}) => {
    let response;
    try {
      response = await fetcher(baseUrl + path, {
        ...options,
        signal,
        credentials: 'include',
        headers: {
          'X-Nomina-Request': '1',
          ...extraHeaders,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error(
        options.method && options.method !== 'GET'
          ? 'No se pudo confirmar el guardado. Conservamos lo escrito. Revisa el listado antes de repetir la operación para evitar duplicados.'
          : 'No se pudo conectar. Comprueba que el servicio de Nómina esté disponible.',
      );
    }
    if (response.status === 204) return null;
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        options.method && options.method !== 'GET'
          ? 'No se pudo confirmar el guardado. Conservamos lo escrito. Revisa el listado antes de repetir la operación para evitar duplicados.'
          : 'El servicio de Nómina no está disponible. No se pudo cargar la información. Reintenta en unos momentos o avisa a soporte.',
      );
    }
    if (!response.ok) {
      if (data.code === 'LOGIN_REQUIRED' && typeof window !== 'undefined')
        window.dispatchEvent(new Event('nomina-session-expired'));
      const error = new Error(data.message || 'No se pudo completar la operación.');
      error.fields = data.fields || {};
      error.code = data.code;
      throw error;
    }
    return data;
  };
}
