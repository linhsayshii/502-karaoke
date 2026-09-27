import type { ImportDefinition, ImportType } from "@/lib/excel-import/definitions";
import { columnLetter, isBlank, type SheetData } from "@/lib/excel-import/workbook";

// Which Excel column feeds which field: guessed from the headers, then
// adjusted by the user. The last choices are remembered per import type.

export interface Column {
  index: number; // index in the sheet rows
  letter: string; // "B"
  header: string;
  samples: string[];
}

// Field key → column index (absent: not imported).
export type Mapping = Record<string, number | undefined>;

// "Đơn giá (VNĐ)" → "don gia vnd": no diacritics, case or punctuation.
export function normalizeHeader(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sheetColumns(sheet: SheetData, headerIndex: number): Column[] {
  const header = sheet.rows[headerIndex] ?? [];
  const body = sheet.rows.slice(headerIndex + 1);
  const width = Math.max(header.length, ...body.slice(0, 50).map((r) => r.length));
  const columns: Column[] = [];
  for (let index = 0; index < width; index++) {
    const samples = body
      .map((r) => r[index])
      .filter((v) => !isBlank(v))
      .slice(0, 3)
      .map(String);
    if (isBlank(header[index]) && samples.length === 0) continue;
    columns.push({
      index,
      letter: columnLetter(sheet.firstCol + index),
      header: isBlank(header[index]) ? "" : String(header[index]).trim(),
      samples,
    });
  }
  return columns;
}

const storageKey = (type: ImportType) => `excel-import:${type}`;

// Normalized header → field key, from earlier imports on this browser.
function loadRemembered(type: ImportType): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(type)) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberMapping(type: ImportType, columns: Column[], mapping: Mapping) {
  try {
    const remembered = loadRemembered(type);
    const byIndex = new Map(columns.map((c) => [c.index, c]));
    // Headers now left unmapped are forgotten.
    for (const column of columns) delete remembered[normalizeHeader(column.header)];
    for (const [key, index] of Object.entries(mapping)) {
      const header = index === undefined ? "" : normalizeHeader(byIndex.get(index)?.header ?? "");
      if (header) remembered[header] = key;
    }
    localStorage.setItem(storageKey(type), JSON.stringify(remembered));
  } catch {
    // Storage unavailable: the guess still works.
  }
}

// Remembered choices first, then headers equal to an alias, then headers
// containing a longer alias as whole words ("Giá bán lẻ (VNĐ)").
export function guessMapping(definition: ImportDefinition, columns: Column[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<number>();
  const assign = (key: string, column: Column) => {
    if (mapping[key] !== undefined || used.has(column.index)) return;
    mapping[key] = column.index;
    used.add(column.index);
  };
  const fieldKeys = new Set(definition.fields.map((f) => f.key));
  const aliases = definition.fields.map((f) => ({
    key: f.key,
    names: [f.label, ...f.aliases].map(normalizeHeader),
  }));

  const remembered = loadRemembered(definition.type);
  for (const column of columns) {
    const key = remembered[normalizeHeader(column.header)];
    if (key && fieldKeys.has(key)) assign(key, column);
  }
  for (const column of columns) {
    const header = normalizeHeader(column.header);
    const field = aliases.find((a) => a.names.includes(header));
    if (header && field) assign(field.key, column);
  }
  for (const column of columns) {
    const header = ` ${normalizeHeader(column.header)} `;
    let best: { key: string; length: number } | undefined;
    for (const { key, names } of aliases) {
      if (mapping[key] !== undefined) continue;
      for (const name of names) {
        if (name.length >= 4 && header.includes(` ${name} `) && name.length > (best?.length ?? 0)) {
          best = { key, length: name.length };
        }
      }
    }
    if (best) assign(best.key, column);
  }
  return mapping;
}
