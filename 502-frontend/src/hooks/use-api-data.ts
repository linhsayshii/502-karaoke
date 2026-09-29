"use client";

import { useCallback, useEffect, useState } from "react";
import api, { totalCountOf } from "@/lib/api";
import { useNotify } from "@/hooks/use-notify";

// GET `url` with `params`, refetching when they change or on reload().
// Failures show a toast with the server message (or `errorMessage`).
export function useApiData<T>(
  url: string,
  params: Record<string, unknown>,
  initial: T,
  errorMessage: string,
) {
  const notify = useNotify();
  const [data, setData] = useState<T>(initial);
  // X-Total-Count of a capped list (null when the endpoint sends none).
  const [total, setTotal] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const paramsKey = JSON.stringify(params);
  // Identifies the in-flight request; `loading` is derived from comparing it
  // to the key of the request whose result last landed, so changing `url`/
  // `params` (or calling `reload()`) makes `loading` true again without
  // setting state synchronously inside the effect.
  const requestKey = `${url}:${paramsKey}:${version}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    api
      .get<T>(url, { params: JSON.parse(paramsKey) })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setTotal(totalCountOf(res));
      })
      .catch((error) => {
        if (!cancelled) notify.error(error, errorMessage);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [url, paramsKey, requestKey, notify, errorMessage]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, total, loading, reload };
}
