"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDownCircle, ArrowUpCircle, Ban, Plus, Wallet } from "lucide-react";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, firstDayOfMonth, formatDateTime, formatMoney, toDateInput } from "@/lib/format";
import { BUSINESS_DAY_HINT, DOC_TYPE_LABELS, FUND_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { FundSummary, FundTransaction, FundType, PaymentMethod } from "@/lib/types";

const ALL = "ALL";

const EMPTY_SUMMARY: FundSummary = {
  openingBalance: 0,
  income: 0,
  expense: 0,
  net: 0,
  closingBalance: 0,
  salesIncome: 0,
  purchaseExpense: 0,
  byMethod: [],
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
  if (t.order) return `Hóa đơn #${t.order.id}${t.order.room ? ` – ${t.order.room.name}` : ""}`;
  if (t.stockDocument) return `${DOC_TYPE_LABELS[t.stockDocument.type]} ${t.stockDocument.code}`;
  return "Thủ công";
}

// Sổ quỹ: phiếu thu / phiếu chi of the branch. Bill receipts and import
// payments are written automatically; manual ones can be cancelled.
export default function FundsPage() {
  const branch = useBranchCode();
  const notify = useNotify();
  const [from, setFrom] = useState(() => firstDayOfMonth());
  const [to, setTo] = useState(() => businessDate());
  const [type, setType] = useState<FundType | typeof ALL>(ALL);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [summary, setSummary] = useState<FundSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FundForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<FundTransaction | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get<FundTransaction[]>("/funds", {
          params: { branch, from, to, type: type === ALL ? undefined : type },
        }),
        api.get<FundSummary>("/funds/summary", { params: { branch, from, to } }),
      ]);
      setTransactions(listRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      notify.error(error, "Không thể tải sổ quỹ");
    } finally {
      setLoading(false);
    }
    // Filters apply on "Xem"; only the branch reloads automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (fundType: FundType) =>
    setForm({
      type: fundType,
      method: "CASH",
      amount: "",
      category: "",
      description: "",
      occurredAt: nowInput(),
    });

  const save = async () => {
    if (!form) return;
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      notify.error(null, "Số tiền phải lớn hơn 0");
      return;
    }
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
      notify.success(`Đã lưu phiếu ${form.type === "INCOME" ? "thu" : "chi"}`);
      setForm(null);
      load();
    } catch (error) {
      notify.error(error, "Không thể lưu phiếu");
    } finally {
      setSaving(false);
    }
  };

  const cancelEntry = async () => {
    if (!cancelling) return;
    if (!reason.trim()) {
      notify.error(null, "Vui lòng nhập lý do hủy");
      return;
    }
    try {
      await api.post(`/funds/${cancelling.id}/cancel`, { reason: reason.trim() });
      notify.success("Đã hủy phiếu");
      setCancelling(null);
      load();
    } catch (error) {
      notify.error(error, "Không thể hủy phiếu");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sổ quỹ</h2>
          <p className="text-sm text-muted-foreground">
            Phiếu thu tiền hóa đơn và phiếu chi nhập hàng được ghi tự động. {BUSINESS_DAY_HINT}
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => openForm("INCOME")}>
            <Plus className="mr-2 h-4 w-4" /> Phiếu thu
          </Button>
          <Button className="bg-red-600 hover:bg-red-700" onClick={() => openForm("EXPENSE")}>
            <Plus className="mr-2 h-4 w-4" /> Phiếu chi
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Select value={type} onValueChange={(v) => setType(v as FundType | typeof ALL)}>
          <SelectTrigger className="w-[140px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Thu và chi</SelectItem>
            <SelectItem value="INCOME">Chỉ thu</SelectItem>
            <SelectItem value="EXPENSE">Chỉ chi</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span>Từ</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px] bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <span>Đến</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px] bg-white" />
        </div>
        <Button onClick={load} disabled={loading}>
          {loading ? "Đang tải..." : "Xem"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4" /> Tồn đầu kỳ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(summary.openingBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownCircle className="h-4 w-4 text-green-600" /> Tổng thu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatMoney(summary.income)}</div>
            <p className="text-xs text-muted-foreground">Bán hàng: {formatMoney(summary.salesIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ArrowUpCircle className="h-4 w-4 text-red-600" /> Tổng chi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatMoney(summary.expense)}</div>
            <p className="text-xs text-muted-foreground">Nhập hàng: {formatMoney(summary.purchaseExpense)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tồn cuối kỳ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.closingBalance < 0 ? "text-red-600" : "text-blue-600"}`}>
              {formatMoney(summary.closingBalance)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.byMethod
                .map((m) => `${PAYMENT_METHOD_LABELS[m.method]}: ${formatMoney(m.closingBalance)}`)
                .join(" · ")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Hình thức</TableHead>
                <TableHead>Khoản mục</TableHead>
                <TableHead>Diễn giải</TableHead>
                <TableHead>Nguồn</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Người lập</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id} className={t.cancelledAt ? "opacity-50" : ""}>
                  <TableCell>{formatDateTime(t.occurredAt)}</TableCell>
                  <TableCell className="space-x-1">
                    <Badge variant={t.type === "INCOME" ? "default" : "destructive"}>
                      {FUND_TYPE_LABELS[t.type]}
                    </Badge>
                    {t.cancelledAt && (
                      <Badge variant="outline" title={t.cancelReason ?? undefined}>
                        Đã hủy
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[t.method]}</TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate" title={t.cancelReason ?? t.description ?? ""}>
                    {t.description ?? ""}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sourceOf(t)}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${t.cancelledAt ? "line-through" : ""} ${
                      t.type === "INCOME" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {t.type === "INCOME" ? "+" : "-"}
                    {formatMoney(t.amount)}
                  </TableCell>
                  <TableCell>{t.createdBy?.fullName ?? "—"}</TableCell>
                  <TableCell>
                    {!t.cancelledAt && !t.order && !t.stockDocument && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Hủy phiếu"
                        className="text-red-500"
                        onClick={() => {
                          setCancelling(t);
                          setReason("");
                        }}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Không có phiếu thu/chi nào trong khoảng thời gian này.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.type === "INCOME" ? "Lập phiếu thu" : "Lập phiếu chi"}</DialogTitle>
            <DialogDescription>Ghi nhận tiền thu vào hoặc chi ra của cơ sở.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Số tiền</Label>
                <Input
                  className="col-span-3"
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Hình thức</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as PaymentMethod })}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">{PAYMENT_METHOD_LABELS.CASH}</SelectItem>
                    <SelectItem value="TRANSFER">{PAYMENT_METHOD_LABELS.TRANSFER}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Khoản mục</Label>
                <Input
                  className="col-span-3"
                  placeholder={form.type === "INCOME" ? "Thu khác, góp vốn..." : "Điện nước, lương..."}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Thời gian</Label>
                <Input
                  className="col-span-3"
                  type="datetime-local"
                  value={form.occurredAt}
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="pt-2 text-right">Diễn giải</Label>
                <Textarea
                  className="col-span-3"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Hủy
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu phiếu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy phiếu {cancelling && FUND_TYPE_LABELS[cancelling.type].toLowerCase()}</DialogTitle>
            <DialogDescription>
              Phiếu {formatMoney(cancelling?.amount)} vẫn được giữ trong sổ nhưng không còn tính vào tồn quỹ.
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="Lý do hủy" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Đóng
            </Button>
            <Button variant="destructive" onClick={cancelEntry}>
              Hủy phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
