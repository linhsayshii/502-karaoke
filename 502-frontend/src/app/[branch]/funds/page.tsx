"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanIcon,
  BanknoteIcon,
  LandmarkIcon,
  MoreHorizontalIcon,
  WalletIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReasonDialog } from "@/components/reason-dialog";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import {
  businessDate,
  firstDayOfMonth,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  toDateInput,
} from "@/lib/format";
import { BUSINESS_DAY_HINT, DOC_TYPE_LABELS, FUND_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { SHOW_FROM } from "@/lib/responsive";
import type { FundSummary, FundTransaction, FundType, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";

const CATEGORY_SUGGESTIONS: Record<FundType, string[]> = {
  INCOME: ["Thu khác", "Góp vốn", "Thu hoàn tiền"],
  EXPENSE: ["Điện nước", "Lương", "Mua hàng", "Sửa chữa", "Thuê mặt bằng", "Chi khác"],
};

interface FundForm {
  type: FundType;
  method: PaymentMethod;
  amount: string;
  category: string;
  description: string;
  occurredAt: string;
}

// datetime-local value for "now" in local time.
function nowInput() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toDateInput(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Where an entry comes from: a paid bill, an import, or typed by hand.
function sourceOf(t: FundTransaction) {
  if (t.order) return `Hóa đơn #${t.order.id}${t.order.room ? ` · ${t.order.room.name}` : ""}`;
  if (t.stockDocument) return `${DOC_TYPE_LABELS[t.stockDocument.type]} ${t.stockDocument.code}`;
  return "Thủ công";
}

function StatTile({ label, value, footer }: { label: string; value: string; footer: string }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>
    </Card>
  );
}

// Sổ quỹ of the branch. Bill receipts and import payments are written
// automatically with their source; manual entries can be cancelled here.
export default function FundsPage() {
  const branch = useBranchCode();
  const notify = useNotify();
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: firstDayOfMonth(), to: businessDate() }));
  const [type, setType] = useState<FundType | typeof ALL>(ALL);
  const [method, setMethod] = useState<PaymentMethod | typeof ALL>(ALL);
  const [transactions, setTransactions] = useState<FundTransaction[] | null>(null);
  const [summary, setSummary] = useState<FundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FundForm | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<FundTransaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get<FundTransaction[]>("/funds", {
          params: {
            branch,
            ...range,
            type: type === ALL ? undefined : type,
            method: method === ALL ? undefined : method,
          },
        }),
        api.get<FundSummary>("/funds/summary", { params: { branch, ...range } }),
      ]);
      setTransactions(listRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      notify.error(error, "Không thể tải sổ quỹ");
    } finally {
      setLoading(false);
    }
  }, [branch, range, type, method, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (fundType: FundType) => {
    setSubmitted(false);
    setForm({ type: fundType, method: "CASH", amount: "", category: "", description: "", occurredAt: nowInput() });
  };

  const amountInvalid = submitted && !(Number(form?.amount) > 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitted(true);
    const amount = Number(form.amount);
    if (!(amount > 0)) return;
    setSaving(true);
    try {
      await api.post(
        "/funds",
        {
          type: form.type,
          method: form.method,
          amount,
          category: form.category.trim() || undefined,
          description: form.description.trim() || undefined,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
        },
        { params: { branch } },
      );
      notify.success(`Đã lưu phiếu ${form.type === "INCOME" ? "thu" : "chi"} ${formatMoney(amount)}`);
      setForm(null);
      load();
    } catch (error) {
      notify.error(error, "Không thể lưu phiếu");
    } finally {
      setSaving(false);
    }
  };

  const cancelEntry = async (reason: string) => {
    if (!cancelling) return;
    try {
      await api.post(`/funds/${cancelling.id}/cancel`, { reason });
      notify.success("Đã hủy phiếu; phiếu vẫn được giữ trong sổ để đối chiếu");
      load();
    } catch (error) {
      notify.error(error, "Không thể hủy phiếu");
      return false;
    }
  };

  const byMethod = (m: PaymentMethod) => summary?.byMethod.find((row) => row.method === m);

  return (
    <>
      <PageHeader
        title="Sổ quỹ"
        description={`Phiếu thu tiền hóa đơn và phiếu chi nhập hàng được ghi tự động. ${BUSINESS_DAY_HINT}`}
        actions={
          <>
            <Button variant="outline" onClick={() => openForm("EXPENSE")}>
              <ArrowUpRightIcon data-icon="inline-start" />
              Lập phiếu chi
            </Button>
            <Button onClick={() => openForm("INCOME")}>
              <ArrowDownLeftIcon data-icon="inline-start" />
              Lập phiếu thu
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <DateRangePicker value={range} onChange={setRange} />
        <ToggleGroup
          type="single"
          variant="outline"
          value={type}
          onValueChange={(v) => v && setType(v as FundType | typeof ALL)}
          aria-label="Loại phiếu"
        >
          <ToggleGroupItem value={ALL}>Thu và chi</ToggleGroupItem>
          <ToggleGroupItem value="INCOME">Chỉ thu</ToggleGroupItem>
          <ToggleGroupItem value="EXPENSE">Chỉ chi</ToggleGroupItem>
        </ToggleGroup>
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod | typeof ALL)}>
          <SelectTrigger className="md:w-44" aria-label="Hình thức">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>Mọi hình thức</SelectItem>
              <SelectItem value="CASH">{PAYMENT_METHOD_LABELS.CASH}</SelectItem>
              <SelectItem value="TRANSFER">{PAYMENT_METHOD_LABELS.TRANSFER}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {!summary ? (
        <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-4 transition-opacity @xl/main:grid-cols-2 @5xl/main:grid-cols-4",
            loading && "opacity-60",
          )}
        >
          <StatTile
            label="Tồn đầu kỳ"
            value={formatMoney(summary.openingBalance)}
            footer={`Số dư trước ngày ${formatDate(range.from)}`}
          />
          <StatTile
            label="Tổng thu"
            value={formatMoney(summary.income)}
            footer={`Trong đó bán hàng ${formatMoney(summary.salesIncome)}`}
          />
          <StatTile
            label="Tổng chi"
            value={formatMoney(summary.expense)}
            footer={`Trong đó nhập hàng ${formatMoney(summary.purchaseExpense)}`}
          />
          <StatTile
            label="Tồn cuối kỳ"
            value={formatMoney(summary.closingBalance)}
            footer={`Tiền mặt ${formatMoney(byMethod("CASH")?.closingBalance)} · CK ${formatMoney(byMethod("TRANSFER")?.closingBalance)}`}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Phiếu thu / chi</CardTitle>
          <CardDescription>
            {formatDateRange(range)} · phiếu đã hủy vẫn hiển thị nhưng không tính vào tổng
          </CardDescription>
        </CardHeader>
        <CardContent className={cn("transition-opacity", loading && transactions && "opacity-60")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead className={SHOW_FROM.xs}>Loại</TableHead>
                <TableHead className={SHOW_FROM.sm}>Hình thức</TableHead>
                <TableHead className={SHOW_FROM.md}>Khoản mục</TableHead>
                <TableHead className={SHOW_FROM.sm}>Diễn giải</TableHead>
                <TableHead className={SHOW_FROM.lg}>Nguồn</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead className={SHOW_FROM.lg}>Người lập</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!transactions ? (
                <TableSkeleton
                  columns={[
                    "",
                    SHOW_FROM.xs,
                    SHOW_FROM.sm,
                    SHOW_FROM.md,
                    SHOW_FROM.sm,
                    SHOW_FROM.lg,
                    "",
                    SHOW_FROM.lg,
                    "",
                  ]}
                />
              ) : transactions.length === 0 ? (
                <TableEmpty
                  colSpan={9}
                  icon={WalletIcon}
                  title="Chưa có phiếu thu/chi"
                  description="Thanh toán hóa đơn và nhập hàng đã trả tiền sẽ tự ghi vào sổ quỹ."
                />
              ) : (
                transactions.map((t) => {
                  const manual = !t.order && !t.stockDocument;
                  return (
                    <TableRow key={t.id} className={cn(t.cancelledAt && "text-muted-foreground")}>
                      <TableCell className="whitespace-normal tabular-nums">{formatDateTime(t.occurredAt)}</TableCell>
                      <TableCell className={SHOW_FROM.xs}>
                        <span className="flex flex-wrap items-center gap-1">
                          <Badge variant={t.type === "INCOME" ? "success" : "secondary"}>
                            {FUND_TYPE_LABELS[t.type]}
                          </Badge>
                          {t.cancelledAt && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="cursor-help">
                                  Đã hủy
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t.cancelReason}
                                {t.cancelledBy && ` · ${t.cancelledBy.fullName}`}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className={SHOW_FROM.sm}>{PAYMENT_METHOD_LABELS[t.method]}</TableCell>
                      <TableCell className={SHOW_FROM.md}>{t.category ?? "—"}</TableCell>
                      <TableCell className={cn("max-w-56 truncate", SHOW_FROM.sm)} title={t.description ?? ""}>
                        {t.description || "—"}
                      </TableCell>
                      <TableCell className={cn("max-w-44 truncate text-muted-foreground", SHOW_FROM.lg)}>
                        {sourceOf(t)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          t.cancelledAt ? "line-through" : t.type === "INCOME" ? "text-success" : "text-destructive",
                        )}
                      >
                        {t.type === "INCOME" ? "+" : "−"}
                        {formatNumber(t.amount)}
                      </TableCell>
                      <TableCell className={SHOW_FROM.lg}>{t.createdBy?.fullName ?? "—"}</TableCell>
                      <TableCell>
                        {manual && !t.cancelledAt && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Thao tác phiếu">
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                <DropdownMenuItem variant="destructive" onSelect={() => setCancelling(t)}>
                                  <BanIcon />
                                  Hủy phiếu
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && !saving && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          {form && (
            <form onSubmit={save} className="flex flex-col gap-6">
              <DialogHeader>
                <DialogTitle>{form.type === "INCOME" ? "Lập phiếu thu" : "Lập phiếu chi"}</DialogTitle>
                <DialogDescription>
                  Tiền thu vào hoặc chi ra ngoài bán hàng/nhập hàng (các khoản đó được ghi tự động).
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>Loại phiếu</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={form.type}
                    onValueChange={(v) => v && setForm({ ...form, type: v as FundType })}
                    className="w-full"
                    aria-label="Loại phiếu"
                  >
                    <ToggleGroupItem value="INCOME" className="flex-1">
                      <ArrowDownLeftIcon />
                      Phiếu thu
                    </ToggleGroupItem>
                    <ToggleGroupItem value="EXPENSE" className="flex-1">
                      <ArrowUpRightIcon />
                      Phiếu chi
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field data-invalid={amountInvalid || undefined}>
                  <FieldLabel htmlFor="fund-amount">Số tiền</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="fund-amount"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      autoFocus
                      value={form.amount}
                      aria-invalid={amountInvalid || undefined}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>đ</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {amountInvalid && <FieldError>Số tiền phải lớn hơn 0</FieldError>}
                </Field>
                <Field>
                  <FieldLabel>Hình thức</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={form.method}
                    onValueChange={(v) => v && setForm({ ...form, method: v as PaymentMethod })}
                    className="w-full"
                    aria-label="Hình thức"
                  >
                    <ToggleGroupItem value="CASH" className="flex-1">
                      <BanknoteIcon />
                      {PAYMENT_METHOD_LABELS.CASH}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="TRANSFER" className="flex-1">
                      <LandmarkIcon />
                      {PAYMENT_METHOD_LABELS.TRANSFER}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="fund-category">Khoản mục</FieldLabel>
                    <Input
                      id="fund-category"
                      list="fund-categories"
                      placeholder={form.type === "INCOME" ? "Thu khác" : "Điện nước"}
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                    <datalist id="fund-categories">
                      {CATEGORY_SUGGESTIONS[form.type].map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="fund-time">Thời gian</FieldLabel>
                    <Input
                      id="fund-time"
                      type="datetime-local"
                      value={form.occurredAt}
                      onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="fund-description">Diễn giải</FieldLabel>
                  <Textarea
                    id="fund-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                  Hủy
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Spinner data-icon="inline-start" />}
                  Lưu phiếu
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Hủy phiếu ${cancelling ? FUND_TYPE_LABELS[cancelling.type].toLowerCase() : ""} ${formatMoney(cancelling?.amount)}?`}
        description="Phiếu vẫn được giữ trong sổ (ai hủy, lúc nào, vì sao) nhưng không còn tính vào tồn quỹ."
        confirmLabel="Hủy phiếu"
        onConfirm={cancelEntry}
      />
    </>
  );
}
