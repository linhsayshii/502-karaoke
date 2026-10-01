"use client";

import { createContext, useContext } from "react";
import type { Site } from "@/lib/site";

// Which site the signed-in shell belongs to, set by the layout of its route
// tree (app/[branch] or app/report/[branch]): the same on the server and in
// the browser, unlike the host name.
const SiteContext = createContext<Site>("main");

export const SiteProvider = SiteContext.Provider;

export function useSite(): Site {
  return useContext(SiteContext);
}
