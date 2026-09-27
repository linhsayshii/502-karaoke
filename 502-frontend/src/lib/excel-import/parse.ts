import type { ImportDefinition, ImportField } from "@/lib/excel-import/definitions";
import type { Mapping } from "@/lib/excel-import/mapping";
import { normalizeHeader } from "@/lib/excel-import/mapping";
import { isBlank, type SheetData } from "@/lib/excel-import/workbook";

// Turns mapped cells into typed values for the API. Cells that cannot be
// read (a price of "abc") are reported on their row before anything is sent.

export type CellValue = string | number | boolean;

export interface ParsedRow {
  row: number; // Excel row number
  values: Record<string, CellValue>;
  errors: string[];
}

// Excel number cells come as numbers; typed text may use Vietnamese or
// English separators: "15.000", "15,000 đ", "1.234,5", "1,234.5".
export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value)
    .trim()
    .replace(/(vnđ|vnd|đồng|đ)$/i, "")
    .replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // The later separator is the decimal one.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const groups = new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`);
    text = groups.test(text) ? text.split(sep).join("") : text.replace(sep, ".");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const TRUE_WORDS = ["co", "x", "yes", "y", "1", "true", "dung", "v"];
const FALSE_WORDS = ["khong", "no", "n", "0", "false", "sai"];

function parseCell(field: ImportField, raw: unknown): { value?: CellValue; error?: string } {
  switch (field.kind) {
    case "text": {
      const text = String(raw).trim().replace(/\s+/g, " ");
      return { value: field.normalize ? field.normalize(text) : text };
    }
    case "number":
    case "int": {
      const number = parseNumber(raw);
      if (number === null) return { error: `"${raw}" không phải là số` };
      if (number < 0) return { error: "không được âm" };
      if (field.kind === "int" && !Number.isInteger(number)) return { error: "phải là số nguyên" };
      return { value: number };
    }
    case "bool": {
      const word = normalizeHeader(String(raw));
      if (TRUE_WORDS.includes(word) || String(raw).trim() === "✓") return { value: true };
      if (FALSE_WORDS.includes(word)) return { value: false };
      return { error: `"${raw}" phải là Có hoặc Không` };
    }
    case "enum": {
      const word = normalizeHeader(String(raw));
      const match = Object.entries(field.options ?? {}).find(
        ([value, names]) => normalizeHeader(value) === word || names.some((n) => normalizeHeader(n) === word),
      );
      if (!match) {
        const allowed = Object.values(field.options ?? {}).map((names) => names[0]);
        return { error: `"${raw}" không hợp lệ (${allowed.join(", ")})` };
      }
      return { value: match[0] };
    }
  }
}

// Data rows below the header; rows with no mapped value are ignored.
export function buildRows(
  definition: ImportDefinition,
  sheet: SheetData,
  headerIndex: number,
  mapping: Mapping,
): ParsedRow[] {
  const rows: ParsedRow[] = [];
  sheet.rows.slice(headerIndex + 1).forEach((cells, offset) => {
    const values: Record<string, CellValue> = {};
    const errors: string[] = [];
    let empty = true;
    for (const field of definition.fields) {
      const index = mapping[field.key];
      if (index === undefined || isBlank(cells[index])) continue;
      empty = false;
      const { value, error } = parseCell(field, cells[index]);
      if (error) errors.push(`${field.label}: ${error}`);
      else if (value !== undefined) values[field.key] = value;
    }
    if (empty) return;
    for (const field of definition.fields) {
      if (field.required === "always" && !(field.key in values) && !errors.some((e) => e.startsWith(field.label))) {
        errors.push(`Thiếu ${field.label.toLowerCase()}`);
      }
    }
    rows.push({ row: sheet.firstRow + headerIndex + 1 + offset, values, errors });
  });
  return rows;
}
