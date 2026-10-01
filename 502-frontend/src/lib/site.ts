// The two faces of the app (spec 2026-10-02-trang-bao-cao-hddt §7.1): the main
// site and the report site, served by the same Next.js app. A host starting
// with "baocao." or "baocao-" is the report site (next.config.ts sends it to
// app/report); every other host is the main one.
export type Site = "main" | "report";

export const REPORT_HOST_RE = /^baocao[.-]/;

// Only meaningful in the browser (event handlers, effects): false on the
// server, where the shell is never rendered (AuthProvider shows its loading
// screen until the session is known).
export function isReportSite(): boolean {
  return typeof window !== "undefined" && REPORT_HOST_RE.test(window.location.hostname);
}
