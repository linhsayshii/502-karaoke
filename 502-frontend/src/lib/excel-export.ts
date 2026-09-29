// Report exports with SheetJS, loaded only when needed (as the Excel import).
// Amounts are written as numbers with a number format, so they add up in
// Excel.

export type ColumnType = "text" | "number" | "decimal" | "money" | "percent";

export interface ExportColumn<R> {
  header: string;
  value: (row: R) => string | number | null;
  type?: ColumnType;
  // A heading above the column, merged over the neighbours with the same
  // one (e.g. "Tồn đầu" over "SL" and "Thành tiền"). A sheet with groups
  // gets two header rows; a column without one spans both.
  group?: string;
}

// A sheet ready to write: the header row, the cells, a format per column.
export interface ExportTable {
  name: string;
  headers: string[];
  groups?: (string | undefined)[];
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
    groups: columns.some((c) => c.group) ? columns.map((c) => c.group) : undefined,
    formats: columns.map((c) => FORMATS[c.type ?? "text"]),
    rows: [...rows, ...(totals ? [totals] : [])].map((row) => columns.map((c) => c.value(row))),
  };
}

export async function exportWorkbook(fileName: string, tables: ExportTable[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const table of tables) {
    const header = headerRows(table);
    const sheet = XLSX.utils.aoa_to_sheet([...header.rows, ...table.rows]);
    if (header.merges.length) sheet["!merges"] = header.merges;
    table.rows.forEach((row, r) =>
      row.forEach((value, c) => {
        const format = table.formats[c];
        const cell = sheet[XLSX.utils.encode_cell({ r: r + header.rows.length, c })];
        if (format && cell && typeof value === "number") cell.z = format;
      }),
    );
    sheet["!cols"] = table.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    // Excel limits sheet names to 31 characters.
    XLSX.utils.book_append_sheet(workbook, sheet, table.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, fileName);
}

type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };

// One header row, or two when columns are grouped: the group over its
// columns' own headers, and a column without a group merged down both rows.
function headerRows(table: ExportTable): { rows: (string | null)[][]; merges: Merge[] } {
  const { headers, groups } = table;
  if (!groups) return { rows: [headers], merges: [] };
  const top: (string | null)[] = [];
  const bottom: (string | null)[] = [];
  const merges: Merge[] = [];
  headers.forEach((header, c) => {
    const group = groups[c];
    if (!group) {
      top.push(header);
      bottom.push(null);
      merges.push({ s: { r: 0, c }, e: { r: 1, c } });
      return;
    }
    bottom.push(header);
    if (c > 0 && groups[c - 1] === group) {
      top.push(null);
      merges[merges.length - 1].e.c = c;
    } else {
      top.push(group);
      merges.push({ s: { r: 0, c }, e: { r: 0, c } });
    }
  });
  return { rows: [top, bottom], merges: merges.filter((m) => m.s.r !== m.e.r || m.s.c !== m.e.c) };
}
