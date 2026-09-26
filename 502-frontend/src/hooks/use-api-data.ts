"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    api
      .get<T>(url, { params: JSON.parse(paramsKey) })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((error) => {
        if (!cancelled) notify.error(error, errorMessage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, paramsKey, version, notify, errorMessage]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, loading, reload };
}
