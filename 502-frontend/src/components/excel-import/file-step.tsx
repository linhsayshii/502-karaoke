"use client";

import { useState } from "react";
import { ArrowRightIcon, FileSpreadsheetIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ACCEPTED_FILES, isBlank, type SheetData } from "@/lib/excel-import/workbook";
import { MAX_IMPORT_ROWS } from "@/lib/excel-import/definitions";
import { cn } from "@/lib/utils";

interface FileStepProps {
  fileName?: string;
  reading: boolean;
  sheets: SheetData[];
  sheetIndex: number;
  headerIndex: number;
  dataRows: number;
  onFile: (file: File) => void;
  onSheet: (index: number) => void;
  onHeader: (index: number) => void;
  onNext: () => void;
}

// Step 1: pick the file, the sheet and the header row.
export function FileStep({
  fileName,
  reading,
  sheets,
  sheetIndex,
  headerIndex,
  dataRows,
  onFile,
  onSheet,
  onHeader,
  onNext,
}: FileStepProps) {
  const [dragging, setDragging] = useState(false);
  const sheet = sheets[sheetIndex];
  // Candidate header rows: the first non-empty rows of the sheet.
  const headerChoices = (sheet?.rows ?? [])
    .map((cells, index) => ({ index, cells: cells.filter((c) => !isBlank(c)).map(String) }))
    .slice(0, 15)
    .filter((r) => r.cells.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chọn file</CardTitle>
        <CardDescription>
          File Excel (.xlsx, .xls) hoặc .csv, có một hàng tiêu đề cột. Mỗi lần nhập tối đa{" "}
          {MAX_IMPORT_ROWS.toLocaleString("vi-VN")} dòng.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <label
            htmlFor="excel-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) onFile(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors hover:bg-muted/50",
              dragging && "border-primary bg-muted/50",
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              {reading ? (
                <Spinner className="size-5" />
              ) : fileName ? (
                <FileSpreadsheetIcon className="size-5 text-success" />
              ) : (
                <UploadIcon className="size-5 text-muted-foreground" />
              )}
            </div>
            {fileName ? (
              <div className="flex min-w-0 max-w-full flex-col gap-1">
                <span className="truncate font-medium">{fileName}</span>
                <span className="text-sm text-muted-foreground">Bấm hoặc kéo thả để chọn file khác</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="font-medium">Kéo thả file vào đây hoặc bấm để chọn</span>
                <span className="text-sm text-muted-foreground">
                  File chỉ được đọc trên máy này; chỉ dữ liệu đã ghép cột được gửi đi.
                </span>
              </div>
            )}
            <input
              id="excel-file"
              type="file"
              accept={ACCEPTED_FILES}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
          </label>

          {sheet && (
            <div className="grid gap-4 @2xl/main:grid-cols-2">
              {sheets.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="import-sheet">Trang tính</FieldLabel>
                  <Select value={String(sheetIndex)} onValueChange={(v) => onSheet(Number(v))}>
                    <SelectTrigger id="import-sheet" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((s, index) => (
                        <SelectItem key={s.name} value={String(index)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="import-header">Hàng tiêu đề</FieldLabel>
                <Select
                  value={String(headerIndex)}
                  onValueChange={(v) => onHeader(Number(v))}
                  disabled={headerChoices.length === 0}
                >
                  <SelectTrigger id="import-header" className="w-full min-w-0 [&>span]:truncate">
                    <SelectValue placeholder="Trang tính trống" />
                  </SelectTrigger>
                  <SelectContent>
                    {headerChoices.map(({ index, cells }) => (
                      <SelectItem key={index} value={String(index)}>
                        <span className="max-w-[70vw] truncate sm:max-w-md">
                          Hàng {sheet.firstRow + index}: {cells.join(" · ")}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Hàng chứa tên các cột (VD: Tên SP, ĐVT, Giá bán). Có {dataRows.toLocaleString("vi-VN")} hàng dữ
                  liệu bên dưới.
                </FieldDescription>
              </Field>
            </div>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onNext} disabled={!sheet || dataRows === 0 || reading}>
          Tiếp tục: ghép cột
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
