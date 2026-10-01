"use client";

import { useEffect, useState } from "react";

// `value` once it has stayed the same for `waitMs`: a search box that asks the
// server once per typed number instead of once per key (as the Hóa đơn page does).
export function useDebouncedValue<T>(value: T, waitMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), waitMs);
    return () => clearTimeout(timer);
  }, [value, waitMs]);
  return debounced;
}
