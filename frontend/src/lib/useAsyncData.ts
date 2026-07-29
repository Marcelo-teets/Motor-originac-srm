import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    loader()
      .then((result) => {
        if (active && requestIdRef.current === requestId) setData(result);
      })
      .catch((err: unknown) => {
        if (active && requestIdRef.current === requestId) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados desta tela.');
        }
      })
      .finally(() => {
        if (active && requestIdRef.current === requestId) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadToken, ...deps]);

  return { data, loading, error, setData, reload };
}
