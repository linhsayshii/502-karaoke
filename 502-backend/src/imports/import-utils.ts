// Pure helpers of the Excel import (unit-tested in imports.spec.ts).

export type ImportAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';

export interface ImportRowResult {
  row: number; // row number in the Excel sheet
  name: string;
  action: ImportAction;
  message?: string;
}

export function summarize(rows: ImportRowResult[]) {
  const summary = { create: 0, update: 0, skip: 0, error: 0 };
  for (const r of rows) {
    if (r.action === 'CREATE') summary.create++;
    else if (r.action === 'UPDATE') summary.update++;
    else if (r.action === 'SKIP') summary.skip++;
    else summary.error++;
  }
  return summary;
}

// Names are matched case-insensitively with collapsed spaces, but keeping the
// diacritics: "Bia" and "Bìa" are different products.
export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

// "Bia  Tiger " → "Bia Tiger"; undefined for a missing or blank value.
export function cleanText(value: string | undefined | null) {
  const text = value?.trim().replace(/\s+/g, ' ');
  return text ? text : undefined;
}

export function stripDiacritics(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export const USERNAME_PATTERN = /^[a-z0-9._]{3,32}$/;

// "Nguyễn Văn An" → "nguyen.van.an" (a valid username, see CreateUserDto).
export function usernameBase(fullName: string) {
  const base = stripDiacritics(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 28)
    .replace(/\.+$/, '');
  return base.length >= 3 ? base : `nv.${base || 'moi'}`;
}

// The base itself when free, else base2, base3… Adds the result to `taken`.
export function uniqueUsername(base: string, taken: Set<string>) {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}${n}`;
  taken.add(candidate);
  return candidate;
}

// Several rows of the same product on one phiếu nhập become one line: the
// quantities add up and the unit cost is their weighted average.
export function mergeCost(
  a: { quantity: number; unitCost: number },
  b: { quantity: number; unitCost: number },
) {
  const quantity = a.quantity + b.quantity;
  const total = a.quantity * a.unitCost + b.quantity * b.unitCost;
  return { quantity, unitCost: Math.round((total / quantity) * 100) / 100 };
}

// Rows of one name in the file: the first one wins, later ones are errors
// (except on a phiếu nhập, where they are merged).
export class SeenNames {
  private seen = new Map<string, number>();

  // The row that already used this name, or undefined (and records it).
  firstRow(name: string, row: number) {
    const key = normalizeName(name);
    const first = this.seen.get(key);
    if (first === undefined) this.seen.set(key, row);
    return first;
  }
}

// Groups records by normalized name (names are not unique in the schema).
export function groupByName<T>(items: T[], nameOf: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeName(nameOf(item));
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}
