"use client";

import { useMemo, useState } from "react";
import {
  ContactIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UserCheckIcon,
  UserPlusIcon,
  UserXIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, formatElapsed, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { PrStaff, PrStats } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StaffForm {
  name: string;
  code: string;
  phone: string;
  note: string;
}

const EMPTY_FORM: StaffForm = { name: "", code: "", phone: "", note: "" };

export default function PrStaffPage() {
  const branch = useBranchCode();
  const { user: me } = useAuth();
  const notify = useNotify();
  const canEdit = can(me, "pr");

  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const {
    data: staff,
    total,
    loading,
    reload,
  } = useApiData<PrStaff[]>(
    "/pr/staff",
    { branch, includeInactive: showInactive },
    [],
    "Không thể tải danh sách PR/KTV",
  );
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const { data: stats, loading: statsLoading } = useApiData<PrStats | null>(
    "/pr/stats",
    { branch, from: range.from, to: range.to },
    null,
    "Không thể tải thống kê PR",
  );
  const statsById = useMemo(() => new Map((stats?.rows ?? []).map((r) => [r.prStaffId, r])), [stats]);
  const [sortBy, setSortBy] = useState<"name" | "hours">("name");
  const [editing, setEditing] = useState<PrStaff | "new" | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<PrStaff | null>(null);

  const keyword = search.trim().toLowerCase();
  // filter() copies the list, so sorting it leaves `staff` alone.
  const shown = useMemo(() => {
    const list = staff.filter(
      (s) => !keyword || s.name.toLowerCase().includes(keyword) || s.code?.toLowerCase().includes(keyword),
    );
    if (sortBy === "hours") {
      list.sort((a, b) => (statsById.get(b.id)?.minutes ?? 0) - (statsById.get(a.id)?.minutes ?? 0));
    }
    return list;
  }, [staff, keyword, sortBy, statsById]);

  const openForm = (target: PrStaff | "new") => {
    setEditing(target);
    setSubmitted(false);
    setForm(
      target === "new"
        ? EMPTY_FORM
        : {
            name: target.name,
            code: target.code ?? "",
            phone: target.phone ?? "",
            note: target.note ?? "",
          },
    );
  };

  const isNew = editing === "new";
  const nameInvalid = submitted && !form.name.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSubmitted(true);
    if (!form.name.trim()) return;
    const body = {
      name: form.name.trim(),
      code: form.code.trim(),
      phone: form.phone.trim(),
      note: form.note.trim(),
    };
    setSaving(true);
    try {
      if (isNew) {
        await api.post("/pr/staff", body, { params: { branch } });
        notify.success(`Đã thêm ${body.name}`);
      } else {
        await api.patch(`/pr/staff/${editing.id}`, body);
        notify.success(`Đã cập nhật ${body.name}`);
      }
      setEditing(null);
      reload();
    } catch (error) {
      notify.error(error, "Không thể lưu PR/KTV");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (target: PrStaff, active: boolean) => {
    try {
      await api.patch(`/pr/staff/${target.id}`, { active });
      notify.success(active ? `${target.name} đi làm lại` : `Đã chuyển ${target.name} sang đã nghỉ`);
      reload();
    } catch (error) {
      notify.error(error, "Không thể cập nhật PR/KTV");
    }
  };

  const remove = async (target: PrStaff) => {
    try {
      const res = await api.delete<{ deleted: boolean }>(`/pr/staff/${target.id}`);
      notify.success(
        res.data.deleted
          ? `Đã xóa ${target.name}`
          : `${target.name} đã có lịch sử điểm danh hoặc vào phòng nên được chuyển sang đã nghỉ (lịch sử vẫn giữ)`,
      );
      reload();
    } catch (error) {
      notify.error(error, "Không thể xóa PR/KTV");
      return false;
    }
  };

  return (
    <>
      <PageHeader
        title="Thống kê PR"
        info="Danh sách PR/KTV của cơ sở và số giờ trong phòng theo khoảng ngày. Quản lý và tài khoản “Quản lý PR/KTV” mới thêm, sửa, xóa được."
        actions={
          canEdit && (
            <Button onClick={() => openForm("new")}>
              <UserPlusIcon data-icon="inline-start" />
              Thêm PR/KTV
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>PR/KTV</CardTitle>
          <CardDescription>
            {canEdit
              ? "Người đã điểm danh hoặc vào phòng khi xóa sẽ được chuyển sang “đã nghỉ” để giữ lịch sử."
              : "Danh sách PR/KTV của cơ sở (chỉ xem)."}{" "}
            Số giờ là tổng thời gian trong phòng của các lượt bắt đầu trong khoảng ngày đã chọn.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="w-full md:max-w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Tìm tên hoặc mã"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm PR/KTV"
              />
            </InputGroup>
            <DateRangePicker value={range} onChange={setRange} />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={sortBy}
              onValueChange={(v) => v && setSortBy(v as "name" | "hours")}
              aria-label="Sắp xếp"
            >
              <ToggleGroupItem value="name">Tên</ToggleGroupItem>
              <ToggleGroupItem value="hours">Số giờ</ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center gap-2 md:ml-auto">
              <Switch id="show-left" checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor="show-left" className="font-normal">
                Hiện người đã nghỉ
              </Label>
            </div>
          </div>

          <ListLimitNotice
            shown={staff.length}
            total={total}
            noun="người"
            hint="Tìm theo tên hoặc mã để thấy người chưa hiện."
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ tên</TableHead>
                <TableHead className="text-right">Số giờ</TableHead>
                <TableHead className={cn("text-right", SHOW_FROM.xs)}>Lượt</TableHead>
                <TableHead className={cn("text-right", SHOW_FROM.sm)}>Số phòng</TableHead>
                <TableHead className={SHOW_FROM.xs}>Mã</TableHead>
                <TableHead className={SHOW_FROM.md}>Điện thoại</TableHead>
                <TableHead className={SHOW_FROM.lg}>Ghi chú</TableHead>
                <TableHead className={SHOW_FROM.sm}>Trạng thái</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && staff.length === 0 ? (
                <TableSkeleton
                  columns={[
                    "",
                    "",
                    SHOW_FROM.xs,
                    SHOW_FROM.sm,
                    SHOW_FROM.xs,
                    SHOW_FROM.md,
                    SHOW_FROM.lg,
                    SHOW_FROM.sm,
                    "",
                  ]}
                />
              ) : shown.length === 0 ? (
                <TableEmpty
                  colSpan={9}
                  icon={ContactIcon}
                  title={keyword ? "Không tìm thấy PR/KTV" : "Chưa có PR/KTV nào"}
                />
              ) : (
                shown.map((s) => {
                  const row = statsById.get(s.id);
                  return (
                    <TableRow key={s.id} className={cn(!s.active && "text-muted-foreground")}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{s.name}</span>
                          <span className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>
                            {[s.code, s.phone, !s.active && "đã nghỉ"].filter(Boolean).join(" · ")}
                          </span>
                          {/* The phone column only shows from md, so between sm and md it sits here. */}
                          {s.phone && (
                            <span className="hidden text-xs text-muted-foreground @xl/main:block @3xl/main:hidden">
                              {s.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {statsLoading && !stats ? "…" : formatElapsed(row?.minutes ?? 0)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", SHOW_FROM.xs)}>
                        {formatNumber(row?.sessions ?? 0)}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", SHOW_FROM.sm)}>
                        {formatNumber(row?.rooms ?? 0)}
                      </TableCell>
                      <TableCell className={SHOW_FROM.xs}>{s.code || "—"}</TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.md)}>{s.phone || "—"}</TableCell>
                      <TableCell className={cn("max-w-64 truncate", SHOW_FROM.lg)}>{s.note || "—"}</TableCell>
                      <TableCell className={SHOW_FROM.sm}>
                        {s.active ? (
                          <Badge variant="success">Đang làm</Badge>
                        ) : (
                          <Badge variant="outline">Đã nghỉ</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${s.name}`}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                <DropdownMenuItem onSelect={() => openForm(s)}>
                                  <PencilIcon />
                                  Sửa
                                </DropdownMenuItem>
                                {s.active ? (
                                  <DropdownMenuItem onSelect={() => setActive(s, false)}>
                                    <UserXIcon />
                                    Chuyển sang đã nghỉ
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onSelect={() => setActive(s, true)}>
                                    <UserCheckIcon />
                                    Đi làm lại
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(s)}>
                                  <Trash2Icon />
                                  Xóa
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
            {/* Totals come from the server (stats.totals), never from the list. */}
            {stats && (
              <TableFooter>
                <TableRow>
                  <TableCell>Tổng cộng</TableCell>
                  <TableCell className="text-right tabular-nums">{formatElapsed(stats.totals.minutes)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.xs)}>
                    {formatNumber(stats.totals.sessions)}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.sm)}>
                    {formatNumber(stats.totals.rooms)}
                  </TableCell>
                  {/* Empty cells mirror the header's remaining columns at every width. */}
                  <TableCell className={SHOW_FROM.xs} />
                  <TableCell className={SHOW_FROM.md} />
                  <TableCell className={SHOW_FROM.lg} />
                  <TableCell className={SHOW_FROM.sm} />
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{isNew ? "Thêm PR/KTV" : "Sửa PR/KTV"}</DialogTitle>
              <DialogDescription>PR/KTV không cần tài khoản đăng nhập.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor="pr-name">Họ tên</FieldLabel>
                <Input
                  id="pr-name"
                  value={form.name}
                  maxLength={100}
                  aria-invalid={nameInvalid || undefined}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {nameInvalid && <FieldError>Vui lòng nhập họ tên</FieldError>}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="pr-code">Mã/số thẻ</FieldLabel>
                  <Input
                    id="pr-code"
                    value={form.code}
                    maxLength={30}
                    placeholder="Không bắt buộc"
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pr-phone">Điện thoại</FieldLabel>
                  <Input
                    id="pr-phone"
                    type="tel"
                    value={form.phone}
                    maxLength={30}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="pr-note">Ghi chú</FieldLabel>
                <Textarea
                  id="pr-note"
                  value={form.note}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Xóa ${removing?.name ?? ""} khỏi danh sách?`}
        description="Nếu người này đã có lịch sử điểm danh hoặc vào phòng, họ được chuyển sang “đã nghỉ” để giữ lịch sử."
        confirmLabel="Xóa"
        destructive
        onConfirm={async () => {
          if (removing) return remove(removing);
        }}
      />
    </>
  );
}
