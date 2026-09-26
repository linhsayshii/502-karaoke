"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Lets a page put its own last breadcrumb (e.g. "Phòng P101") in the header.
const PageTitleContext = createContext<{
  title: string | null;
  setTitle: (title: string | null) => void;
}>({ title: null, setTitle: () => {} });

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitle(title: string | null | undefined) {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

export function useCurrentPageTitle() {
  return useContext(PageTitleContext).title;
}
