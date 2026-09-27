// Report exports with SheetJS, loaded only when needed (as the Excel import).
// Amounts are written as numbers with a number format, so they add up in
// Excel.

export type ColumnType = "text" | "number" | "decimal" | "money" | "percent";

export interface ExportColumn<R> {
  header: string;
  value: (row: R) => string | number | null;
  type?: ColumnType;
}

// A sheet ready to write: the header row, the cells, a format per column.
export interface ExportTable {
  name: string;
  headers: string[];
  formats: (string | undefined)[];
  rows: (string | number | null)[][];
}

const FORMATS: Record<ColumnType, string | undefined> = {
  text: undefined,
  number: "#,##0",
  decimal: "#,##0.0",
  money: "#,##0",
  percent: "0.0%",
};

// `totals`, when given, becomes the last row.
export function toSheet<R>(name: string, columns: ExportColumn<R>[], rows: R[], totals?: R): ExportTable {
  return {
    name,
    headers: columns.map((c) => c.header),
    formats: columns.map((c) => FORMATS[c.type ?? "text"]),
    rows: [...rows, ...(totals ? [totals] : [])].map((row) => columns.map((c) => c.value(row))),
  };
}

export async function exportWorkbook(fileName: string, tables: ExportTable[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const table of tables) {
    const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
    table.rows.forEach((row, r) =>
      row.forEach((value, c) => {
        const format = table.formats[c];
        const cell = sheet[XLSX.utils.encode_cell({ r: r + 1, c })];
        if (format && cell && typeof value === "number") cell.z = format;
      }),
    );
    sheet["!cols"] = table.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    // Excel limits sheet names to 31 characters.
    XLSX.utils.book_append_sheet(workbook, sheet, table.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, fileName);
}
