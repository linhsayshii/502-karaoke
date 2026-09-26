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
import { ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { firstDayOfMonth, formatDateTime, formatMoney, toDateInput } from "@/lib/format";
import type { FundTransaction, FundType } from "@/lib/types";

const TYPE_LABELS: Record<FundType, string> = { INCOME: "Thu", EXPENSE: "Chi" };
const ALL = "ALL";

interface Summary {
  income: number;
  expense: number;
  net: number;
}

interface FundForm {
  type: FundType;
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

// Quỹ tiền mặt: phiếu thu / phiếu chi ghi tay của cơ sở.
export default function FundsPage() {
  const branch = useBranchCode();
  const notify = useNotify();
  const [from, setFrom] = useState(() => firstDayOfMonth());
  const [to, setTo] = useState(() => toDateInput());
  const [type, setType] = useState<FundType | typeof ALL>(ALL);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0, net: 0 });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FundForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.get<FundTransaction[]>("/funds", {
          params: { branch, from, to, type: type === ALL ? undefined : type },
        }),
        api.get<Summary>("/funds/summary", { params: { branch, from, to } }),
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
    setForm({ type: fundType, amount: "", category: "", description: "", occurredAt: nowInput() });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Sổ quỹ</h2>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownCircle className="h-4 w-4 text-green-600" /> Tổng thu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatMoney(summary.income)}</div>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Chênh lệch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.net < 0 ? "text-red-600" : "text-blue-600"}`}>
              {formatMoney(summary.net)}
            </div>
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
                <TableHead>Khoản mục</TableHead>
                <TableHead>Diễn giải</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Người lập</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{formatDateTime(t.occurredAt)}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === "INCOME" ? "default" : "destructive"}>
                      {TYPE_LABELS[t.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell className="max-w-[320px] truncate">{t.description ?? ""}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${t.type === "INCOME" ? "text-green-600" : "text-red-600"}`}
                  >
                    {t.type === "INCOME" ? "+" : "-"}
                    {formatMoney(t.amount)}
                  </TableCell>
                  <TableCell>{t.createdBy?.fullName ?? "—"}</TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
            <DialogDescription>Ghi nhận tiền mặt thu vào hoặc chi ra của cơ sở.</DialogDescription>
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
                <Label className="text-right">Khoản mục</Label>
                <Input
                  className="col-span-3"
                  placeholder={form.type === "INCOME" ? "Thu khác, góp vốn..." : "Điện nước, lương, mua hàng..."}
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
    </div>
  );
}
