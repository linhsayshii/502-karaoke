"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckIcon, CircleCheckBigIcon, FileUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/data-states";
import { FileStep } from "@/components/excel-import/file-step";
import { MappingStep } from "@/components/excel-import/mapping-step";
import { PreviewStep, UNPAID, type ImportOptions } from "@/components/excel-import/preview-step";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { ACTION_LABELS, MAX_IMPORT_ROWS, type ImportDefinition } from "@/lib/excel-import/definitions";
import { guessMapping, rememberMapping, sheetColumns, type Mapping } from "@/lib/excel-import/mapping";
import { buildRows } from "@/lib/excel-import/parse";
import { detectHeaderRow, readWorkbook, type SheetData } from "@/lib/excel-import/workbook";
import { formatMoney } from "@/lib/format";
import type { ImportAction, ImportResult, ImportRowResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "file" | "mapping" | "preview" | "done";

const STEPS: { step: Step; label: string }[] = [
  { step: "file", label: "Chọn file" },
  { step: "mapping", label: "Ghép cột" },
  { step: "preview", label: "Kiểm tra" },
  { step: "done", label: "Hoàn tất" },
];

const SUMMARY_KEYS = { CREATE: "create", UPDATE: "update", SKIP: "skip" } as const;

const DEFAULT_OPTIONS: ImportOptions = { onDuplicate: "SKIP", create: true, supplier: "", note: "", payment: "CASH" };

// Excel import in four steps. The file is read in the browser; the API
// checks the mapped rows (dry run) and then writes them in one transaction.
export function ImportWizard({ definition }: { definition: ImportDefinition }) {
  const branch = useBranchCode();
  const notify = useNotify();
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState<string>();
  const [reading, setReading] = useState(false);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [recheck, setRecheck] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const sheet = sheets[sheetIndex];
  const columns = useMemo(() => (sheet ? sheetColumns(sheet, headerIndex) : []), [sheet, headerIndex]);
  const parsed = useMemo(
    () => (sheet && step !== "file" ? buildRows(definition, sheet, headerIndex, mapping) : []),
    [definition, sheet, headerIndex, mapping, step],
  );
  const dataRows = sheet ? sheet.rows.slice(headerIndex + 1).filter((r) => r.some((c) => String(c).trim())).length : 0;
  const tooMany = parsed.length > MAX_IMPORT_ROWS;
  // Rows the browser could read; the others are shown as errors right away.
  const readable = useMemo(() => parsed.filter((r) => r.errors.length === 0), [parsed]);

  const requestBody = (dryRun: boolean, rows = readable) => ({
    dryRun,
    rows: rows.map((r) => ({ row: r.row, ...r.values })),
    ...(definition.duplicates && { onDuplicate: options.onDuplicate }),
    ...(definition.createOption && { [definition.createOption.key]: options.create }),
    ...(definition.type === "stock-import" && {
      supplier: options.supplier.trim() || undefined,
      note: options.note.trim() || undefined,
      paymentMethod: options.payment === UNPAID ? undefined : options.payment,
    }),
  });

  // Dry run whenever the rows or an option that changes the outcome change.
  const checkKey = JSON.stringify([readable, options.onDuplicate, options.create, recheck]);
  useEffect(() => {
    if (step !== "preview" || tooMany) return;
    if (readable.length === 0) {
      setCheck(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    api
      .post<ImportResult>(definition.endpoint, requestBody(true), { params: { branch } })
      .then((res) => !cancelled && setCheck(res.data))
      .catch((error) => !cancelled && notify.error(error, "Không thể kiểm tra dữ liệu"))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
    // requestBody only depends on what checkKey covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkKey, tooMany, branch, definition.endpoint, notify]);

  // Browser-side errors and the server's verdicts, in sheet order (rows the
  // server has not checked yet are left out).
  const nameKey = definition.fields[0].key;
  const previewRows = useMemo<ImportRowResult[]>(() => {
    const server = new Map((check?.rows ?? []).map((r) => [r.row, r]));
    return parsed.flatMap((r): ImportRowResult[] => {
      if (r.errors.length === 0) return server.has(r.row) ? [server.get(r.row)!] : [];
      const name = String(r.values[nameKey] ?? "");
      return [{ row: r.row, name, action: "ERROR", message: r.errors.join("; ") }];
    });
  }, [parsed, check, nameKey]);

  const openFile = async (file: File) => {
    setReading(true);
    try {
      const read = await readWorkbook(file);
      const first = Math.max(
        0,
        read.findIndex((s) => s.rows.length > 1),
      );
      setSheets(read);
      setSheetIndex(first);
      setHeaderIndex(detectHeaderRow(read[first]?.rows ?? []));
      setFileName(file.name);
      setCheck(null);
    } catch {
      notify.error(null, "Không đọc được file; hãy chọn file Excel (.xlsx, .xls) hoặc .csv");
    } finally {
      setReading(false);
    }
  };

  const goToMapping = () => {
    setMapping(guessMapping(definition, columns));
    setStep("mapping");
  };

  const goToPreview = () => {
    rememberMapping(definition.type, columns, mapping);
    setCheck(null);
    setStep("preview");
  };

  const runImport = async () => {
    const verdicts = new Map(previewRows.map((r) => [r.row, r.action]));
    const rows = readable.filter((r) => verdicts.get(r.row) !== "ERROR");
    setSaving(true);
    try {
      const res = await api.post<ImportResult>(definition.endpoint, requestBody(false, rows), { params: { branch } });
      setResult(res.data);
      setStep("done");
      notify.success(
        res.data.document ? `Đã lưu phiếu ${res.data.document.code}` : `Đã nhập ${definition.title.toLowerCase()}`,
      );
    } catch (error) {
      // Data changed since the check: show the new verdicts.
      notify.error(error, "Không thể nhập dữ liệu");
      setRecheck((n) => n + 1);
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setStep("file");
    setSheets([]);
    setFileName(undefined);
    setMapping({});
    setCheck(null);
    setResult(null);
    setOptions(DEFAULT_OPTIONS);
  };

  const current = STEPS.findIndex((s) => s.step === step);
  const labelOf = (action: ImportAction) => definition.actionLabels?.[action] ?? ACTION_LABELS[action];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ol className="flex items-center gap-2 text-sm" aria-label="Các bước nhập">
        {STEPS.map((s, index) => (
          <li
            key={s.step}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              index > 0 && "before:h-px before:w-4 before:bg-border @md/main:before:w-8",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                index < current && "border-primary bg-primary text-primary-foreground",
                index === current && "border-primary text-primary",
                index > current && "text-muted-foreground",
              )}
            >
              {index < current ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                index === current ? "font-medium" : "text-muted-foreground",
                index !== current && "hidden @xl/main:inline",
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {step === "file" && (
        <FileStep
          fileName={fileName}
          reading={reading}
          sheets={sheets}
          sheetIndex={sheetIndex}
          headerIndex={headerIndex}
          dataRows={dataRows}
          onFile={openFile}
          onSheet={(index) => {
            setSheetIndex(index);
            setHeaderIndex(detectHeaderRow(sheets[index].rows));
          }}
          onHeader={setHeaderIndex}
          onNext={goToMapping}
        />
      )}
      {step === "mapping" && (
        <MappingStep
          definition={definition}
          columns={columns}
          mapping={mapping}
          onChange={setMapping}
          onBack={() => setStep("file")}
          onNext={goToPreview}
        />
      )}
      {step === "preview" && (
        <PreviewStep
          definition={definition}
          rows={previewRows}
          totalRows={parsed.length}
          checking={checking}
          loading={checking && !check}
          saving={saving}
          totalAmount={check?.totalAmount}
          options={options}
          onOptions={(patch) => setOptions((o) => ({ ...o, ...patch }))}
          onBack={() => setStep("mapping")}
          onImport={runImport}
        />
      )}
      {step === "done" && result && (
        <Card>
          <CardContent>
            <EmptyState
              icon={CircleCheckBigIcon}
              title={result.document ? `Đã lưu phiếu ${result.document.code}` : "Đã nhập dữ liệu"}
              description={[
                ...(["CREATE", "UPDATE", "SKIP"] as const)
                  .map((action) => [labelOf(action), result.summary[SUMMARY_KEYS[action]]] as const)
                  .filter(([, n], index) => n > 0 || index === 0)
                  .map(([label, n]) => `${label} ${n}`),
                ...(result.document ? [`Tổng tiền ${formatMoney(result.document.totalAmount)}`] : []),
              ].join(" · ")}
            >
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`/${branch}${definition.resultPath}`}>{definition.resultLabel}</Link>
                </Button>
                <Button variant="outline" onClick={restart}>
                  <FileUpIcon data-icon="inline-start" />
                  Nhập file khác
                </Button>
              </div>
            </EmptyState>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
