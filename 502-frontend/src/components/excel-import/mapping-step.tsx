"use client";

import { ArrowLeftIcon, ArrowRightIcon, CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImportDefinition } from "@/lib/excel-import/definitions";
import type { Column, Mapping } from "@/lib/excel-import/mapping";
import { cn } from "@/lib/utils";

const NONE = "none";

// Field, column picker, sample values: one row per field on a wide card,
// stacked on a phone.
const ROW_GRID =
  "grid gap-2 @2xl/map:grid-cols-[minmax(0,15rem)_minmax(0,18rem)_minmax(0,1fr)] @2xl/map:items-center @2xl/map:gap-4";

export const columnName = (column: Column) => `${column.letter} · ${column.header || "(không có tiêu đề)"}`;

interface MappingStepProps {
  definition: ImportDefinition;
  columns: Column[];
  mapping: Mapping;
  onChange: (mapping: Mapping) => void;
  onBack: () => void;
  onNext: () => void;
}

// Step 2: which Excel column feeds which field.
export function MappingStep({ definition, columns, mapping, onChange, onBack, onNext }: MappingStepProps) {
  const byIndex = new Map(columns.map((c) => [c.index, c]));
  const missing = definition.fields.filter((f) => f.required === "always" && mapping[f.key] === undefined);
  const usedIndexes = new Set(Object.values(mapping));
  const unused = columns.filter((c) => !usedIndexes.has(c.index));

  // A column feeds one field: picking it here takes it from the other field.
  const pick = (key: string, value: string) => {
    const index = value === NONE ? undefined : Number(value);
    const next: Mapping = {};
    for (const [k, i] of Object.entries(mapping)) {
      if (k !== key && i !== index) next[k] = i;
    }
    if (index !== undefined) next[key] = index;
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ghép cột</CardTitle>
        <CardDescription>
          Chọn cột trong file tương ứng với từng trường dữ liệu. Hệ thống đã tự đoán theo tiêu đề cột và nhớ lựa
          chọn của lần trước.
        </CardDescription>
      </CardHeader>
      <CardContent className="@container/map flex flex-col gap-4">
        <div className={cn(ROW_GRID, "hidden border-b pb-2 text-sm font-medium @2xl/map:grid")}>
          <span>Trường dữ liệu</span>
          <span>Cột trong file</span>
          <span>Giá trị ví dụ</span>
        </div>
        <div className="flex flex-col">
          {definition.fields.map((field) => {
            const column = mapping[field.key] === undefined ? undefined : byIndex.get(mapping[field.key]!);
            const required = field.required === "always";
            return (
              <div key={field.key} className={cn(ROW_GRID, "border-b py-3 last:border-b-0")}>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    {required && <Badge variant="secondary">Bắt buộc</Badge>}
                    {field.required === "create" && <Badge variant="outline">Khi tạo mới</Badge>}
                  </div>
                  {field.hint && <span className="text-xs text-muted-foreground">{field.hint}</span>}
                </div>
                <Select value={column ? String(column.index) : NONE} onValueChange={(v) => pick(field.key, v)}>
                  <SelectTrigger
                    aria-label={`Cột cho ${field.label}`}
                    aria-invalid={(required && !column) || undefined}
                    className="w-full min-w-0 [&>span]:truncate"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Không nhập —</SelectItem>
                    <SelectSeparator />
                    {columns.map((c) => (
                      <SelectItem key={c.index} value={String(c.index)}>
                        <span className="max-w-[70vw] truncate sm:max-w-sm">{columnName(c)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="min-w-0 truncate text-sm text-muted-foreground">
                  {column ? (
                    column.samples.length ? (
                      column.samples.join(" · ")
                    ) : (
                      "(cột trống)"
                    )
                  ) : (
                    <span className="@2xl/map:hidden">Không nhập trường này</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {unused.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Cột không dùng: {unused.map(columnName).join(", ")}
          </p>
        )}
        {missing.length > 0 && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Chưa chọn cột cho trường bắt buộc</AlertTitle>
            <AlertDescription>{missing.map((f) => f.label).join(", ")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Quay lại
        </Button>
        <Button onClick={onNext} disabled={missing.length > 0}>
          Kiểm tra dữ liệu
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
