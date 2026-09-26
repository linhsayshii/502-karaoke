"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Light / dark / system theme; the `dark` class on <html> switches the tokens.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
