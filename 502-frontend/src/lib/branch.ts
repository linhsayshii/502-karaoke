"use client";

import { useParams } from "next/navigation";

// Branch code from the /[branch]/... URL segment. The backend still decides
// what the account may access; this only says which branch the page shows.
export function useBranchCode(): string {
  const params = useParams<{ branch: string }>();
  return params.branch;
}
