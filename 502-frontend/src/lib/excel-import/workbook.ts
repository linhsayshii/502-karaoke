import type { ImportDefinition } from "@/lib/excel-import/definitions";

// Reading and writing spreadsheets with SheetJS, loaded only when needed so
// it stays out of the app bundle.

export interface SheetData {
  name: string;
  rows: unknown[][];
  firstRow: number; // Excel row number of rows[0]
  firstCol: number; // column index (0 = A) of rows[n][0]
}

export const ACCEPTED_FILES = ".xlsx,.xls,.csv";

export async function readWorkbook(file: File): Promise<SheetData[]> {
  const XLSX = await import("xlsx");
  // CSV as text so Vietnamese UTF-8 files without a BOM decode correctly.
  const workbook = file.name.toLowerCase().endsWith(".csv")
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    return {
      name,
      rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true }),
      firstRow: (range?.s.r ?? 0) + 1,
      firstCol: range?.s.c ?? 0,
    };
  });
}

// A, B, … Z, AA, AB…
export function columnLetter(index: number) {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

export const isBlank = (value: unknown) => value === null || value === undefined || String(value).trim() === "";

// The header is the row (among the first ten) with the most filled cells;
// a title such as "BẢNG GIÁ" above it only fills one.
export function detectHeaderRow(rows: unknown[][]) {
  let best = 0;
  let bestCount = 0;
  rows.slice(0, 10).forEach((row, index) => {
    const count = row.filter((cell) => !isBlank(cell)).length;
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  });
  return best;
}

// A sample file: the field labels as headers and one example row.
export async function downloadTemplate(definition: ImportDefinition) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    definition.fields.map((f) => f.label),
    definition.fields.map((f) => f.example),
  ]);
  sheet["!cols"] = definition.fields.map((f) => ({ wch: Math.max(14, f.label.length + 4) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Dữ liệu");
  XLSX.writeFile(workbook, `mau-nhap-${definition.type}.xlsx`);
}
