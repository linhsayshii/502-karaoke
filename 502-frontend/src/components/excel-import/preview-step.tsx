"use client";

import { useState } from "react";
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CircleAlertIcon,
  HandCoinsIcon,
  LandmarkIcon,
  SearchCheckIcon,
  UploadIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { ACTION_LABELS, MAX_IMPORT_ROWS, type ImportDefinition } from "@/lib/excel-import/definitions";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { ImportAction, ImportRowResult, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export const UNPAID = "UNPAID";

export interface ImportOptions {
  onDuplicate: "SKIP" | "UPDATE";
  create: boolean;
  supplier: string;
  note: string;
  payment: PaymentMethod | typeof UNPAID;
}

const ACTION_VARIANTS: Record<ImportAction, "success" | "secondary" | "outline" | "destructive"> = {
  CREATE: "success",
  UPDATE: "secondary",
  SKIP: "outline",
  ERROR: "destructive",
};

const FILTERS = ["ALL", "CREATE", "UPDATE", "SKIP", "ERROR"] as const;
type Filter = (typeof FILTERS)[number];

interface PreviewStepProps {
  definition: ImportDefinition;
  rows: ImportRowResult[];
  totalRows: number;
  checking: boolean;
  loading: boolean; // first check still running
  saving: boolean;
  totalAmount?: number;
  options: ImportOptions;
  onOptions: (patch: Partial<ImportOptions>) => void;
  onBack: () => void;
  onImport: () => void;
}

// Step 3: what each row will do, the import options, and the import button.
export function PreviewStep({
  definition,
  rows,
  totalRows,
  checking,
  loading,
  saving,
  totalAmount,
  options,
  onOptions,
  onBack,
  onImport,
}: PreviewStepProps) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const labelOf = (action: ImportAction) => definition.actionLabels?.[action] ?? ACTION_LABELS[action];
  const count = (action: ImportAction) => rows.filter((r) => r.action === action).length;
  const errors = count("ERROR");
  const writes = count("CREATE") + count("UPDATE");
  const tooMany = totalRows > MAX_IMPORT_ROWS;
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.action === filter);
  const isStock = definition.type === "stock-import";
  const nameLabel = definition.fields[0].label;
  // A phiếu nhập never skips a row.
  const filters = FILTERS.filter((f) => !(isStock && f === "SKIP"));

  return (
    <div className="grid items-start gap-4 md:gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Kiểm tra dữ liệu</CardTitle>
          <CardDescription>
            Chưa có gì được ghi. Các dòng lỗi sẽ không được nhập; hãy sửa trong file rồi chọn lại file nếu cần.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tooMany && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>File quá lớn</AlertTitle>
              <AlertDescription>
                File có {totalRows.toLocaleString("vi-VN")} dòng dữ liệu; mỗi lần nhập tối đa{" "}
                {MAX_IMPORT_ROWS.toLocaleString("vi-VN")} dòng. Hãy chia nhỏ file.
              </AlertDescription>
            </Alert>
          )}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              {filters.map((f) => (
                <TabsTrigger key={f} value={f} className="flex-none">
                  {f === "ALL" ? "Tất cả" : labelOf(f)}
                  <Badge variant={f === "ERROR" && errors > 0 ? "destructive" : "secondary"} className="px-1.5">
                    {f === "ALL" ? rows.length : count(f)}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Dòng</TableHead>
                <TableHead>{nameLabel}</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className={SHOW_FROM.sm}>Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton columns={["", "", "", SHOW_FROM.sm]} />
              ) : shown.length === 0 ? (
                <TableEmpty colSpan={4} icon={SearchCheckIcon} title="Không có dòng nào" />
              ) : (
                shown.map((r) => (
                  <TableRow key={r.row} className={cn(checking && "opacity-60")}>
                    <TableCell className="text-muted-foreground tabular-nums">{r.row}</TableCell>
                    <TableCell className="max-w-48 whitespace-normal">
                      <div className="font-medium break-words">{r.name || "—"}</div>
                      {r.message && (
                        <div className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>{r.message}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANTS[r.action]}>{labelOf(r.action)}</Badge>
                    </TableCell>
                    <TableCell className={cn("whitespace-normal text-muted-foreground", SHOW_FROM.sm)}>
                      {r.message}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="@4xl/main:sticky @4xl/main:top-4">
        <CardHeader>
          <CardTitle>Tùy chọn</CardTitle>
          <CardDescription>Đổi tùy chọn sẽ kiểm tra lại dữ liệu.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {definition.duplicates && (
              <Field>
                <FieldLabel>Khi trùng với dữ liệu đã có</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={options.onDuplicate}
                  onValueChange={(v) => v && onOptions({ onDuplicate: v as ImportOptions["onDuplicate"] })}
                  className="w-full"
                  aria-label="Khi trùng với dữ liệu đã có"
                >
                  <ToggleGroupItem value="SKIP" className="flex-1">
                    Bỏ qua
                  </ToggleGroupItem>
                  <ToggleGroupItem value="UPDATE" className="flex-1">
                    Cập nhật
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {options.onDuplicate === "SKIP"
                    ? "Giữ nguyên dữ liệu đã có, chỉ tạo mới."
                    : "Ghi đè các trường đã ghép cột (ô trống giữ nguyên)."}
                </FieldDescription>
              </Field>
            )}
            {definition.createOption && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="import-create">{definition.createOption.label}</FieldLabel>
                  <FieldDescription>{definition.createOption.description}</FieldDescription>
                </FieldContent>
                <Switch
                  id="import-create"
                  checked={options.create}
                  onCheckedChange={(checked) => onOptions({ create: checked })}
                />
              </Field>
            )}
            {isStock && (
              <>
                <Field>
                  <FieldLabel htmlFor="import-supplier">Nhà cung cấp</FieldLabel>
                  <Input
                    id="import-supplier"
                    value={options.supplier}
                    onChange={(e) => onOptions({ supplier: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Thanh toán</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={options.payment}
                    onValueChange={(v) => v && onOptions({ payment: v as ImportOptions["payment"] })}
                    className="w-full"
                    aria-label="Thanh toán cho nhà cung cấp"
                  >
                    <ToggleGroupItem value="CASH" className="flex-1">
                      <BanknoteIcon />
                      {PAYMENT_METHOD_LABELS.CASH}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="TRANSFER" className="flex-1">
                      <LandmarkIcon />
                      CK
                    </ToggleGroupItem>
                    <ToggleGroupItem value={UNPAID} className="flex-1">
                      <HandCoinsIcon />
                      Chưa trả
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    {options.payment === UNPAID
                      ? "Mua nợ: không ghi sổ quỹ."
                      : `Ghi phiếu chi ${PAYMENT_METHOD_LABELS[options.payment].toLowerCase()} vào sổ quỹ.`}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="import-note">Ghi chú</FieldLabel>
                  <Textarea
                    id="import-note"
                    value={options.note}
                    onChange={(e) => onOptions({ note: e.target.value })}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          {isStock && totalAmount !== undefined && (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Tổng tiền phiếu</span>
              <span className="text-xl font-semibold">{formatMoney(totalAmount)}</span>
            </div>
          )}
          <Button size="lg" onClick={onImport} disabled={saving || checking || tooMany || writes === 0}>
            {saving ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            {isStock ? `Lưu phiếu nhập (${writes} dòng)` : `Nhập ${writes} dòng`}
          </Button>
          {errors > 0 && !tooMany && (
            <p className="text-center text-xs text-muted-foreground">{errors} dòng lỗi sẽ không được nhập.</p>
          )}
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Quay lại ghép cột
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
