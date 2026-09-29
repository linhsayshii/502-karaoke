"use client";

import { useMemo, useState } from "react";
import {
  ClipboardCheckIcon,
  LogInIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Undo2Icon,
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, formatDate, formatNumber, formatTime, toDateTimeInput } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { PrAttendance, PrStaff } from "@/lib/types";
import { cn } from "@/lib/utils";

// One line of the roll call: a PR/KTV and their entry of the day, if any.
// People who have left only show when they were called that day.
interface RollRow {
  prStaffId: number;
  name: string;
  code: string | null;
  entry: PrAttendance | null;
}

// Check-in of a past day, or correction of an entry.
type TimeDialog = { kind: "check-in"; row: RollRow } | { kind: "edit"; row: RollRow; entry: PrAttendance };

// 20:00 of the business day: a sensible default time for a past day.
const eveningOf = (date: string) => `${date}T20:00`;

export default function PrAttendancePage() {
  const branch = useBranchCode();
  const { user: me } = useAuth();
  const notify = useNotify();
  const canEdit = can(me, "pr");
  const today = businessDate();

  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const isToday = date === today;

  const staff = useApiData<PrStaff[]>("/pr/staff", { branch }, [], "Không thể tải danh sách PR/KTV");
  const attendance = useApiData<PrAttendance[]>(
    "/pr/attendance",
    { branch, businessDate: date },
    [],
    "Không thể tải điểm danh",
  );
  const loading = (staff.loading && staff.data.length === 0) || attendance.loading;

  const rows = useMemo<RollRow[]>(() => {
    const byStaff = new Map(attendance.data.map((a) => [a.prStaffId, a]));
    const list: RollRow[] = staff.data.map((s) => ({
      prStaffId: s.id,
      name: s.name,
      code: s.code,
      entry: byStaff.get(s.id) ?? null,
    }));
    const listed = new Set(staff.data.map((s) => s.id));
    for (const a of attendance.data) {
      if (!listed.has(a.prStaffId)) {
        list.push({
          prStaffId: a.prStaffId,
          name: a.prStaff.name,
          code: a.prStaff.code,
          entry: a,
        });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [staff.data, attendance.data]);

  const keyword = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) => !keyword || r.name.toLowerCase().includes(keyword) || r.code?.toLowerCase().includes(keyword),
  );

  const [busyId, setBusyId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<TimeDialog | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState<RollRow | null>(null);

  const run = async (row: RollRow, action: () => Promise<unknown>, success: string, failure: string) => {
    setBusyId(row.prStaffId);
    try {
      await action();
      notify.success(success);
      attendance.reload();
    } catch (error) {
      notify.error(error, failure);
    } finally {
      setBusyId(null);
    }
  };

  const checkInNow = (row: RollRow) =>
    run(
      row,
      () => api.post("/pr/attendance", { prStaffId: row.prStaffId }),
      `Đã điểm danh ${row.name}`,
      "Không thể điểm danh",
    );

  const checkOutNow = (row: RollRow, entry: PrAttendance) =>
    run(
      row,
      () => api.post(`/pr/attendance/${entry.id}/check-out`),
      `${row.name} đã ra lúc ${formatTime(new Date())}`,
      "Không thể chấm giờ ra",
    );

  const openDialog = (next: TimeDialog) => {
    setDialog(next);
    setSubmitted(false);
    if (next.kind === "check-in") {
      setCheckIn(eveningOf(date));
      setCheckOut("");
      setNote("");
    } else {
      setCheckIn(toDateTimeInput(new Date(next.entry.checkInAt)));
      setCheckOut(next.entry.checkOutAt ? toDateTimeInput(new Date(next.entry.checkOutAt)) : "");
      setNote(next.entry.note ?? "");
    }
  };

  const timesInvalid = !!checkIn && !!checkOut && new Date(checkOut) < new Date(checkIn);

  const saveDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialog) return;
    setSubmitted(true);
    if (!checkIn || timesInvalid) return;
    setSaving(true);
    try {
      if (dialog.kind === "check-in") {
        await api.post("/pr/attendance", {
          prStaffId: dialog.row.prStaffId,
          businessDate: date,
          checkInAt: new Date(checkIn).toISOString(),
          note: note.trim() || undefined,
        });
        notify.success(`Đã điểm danh ${dialog.row.name}`);
      } else {
        await api.patch(`/pr/attendance/${dialog.entry.id}`, {
          checkInAt: new Date(checkIn).toISOString(),
          checkOutAt: checkOut ? new Date(checkOut).toISOString() : null,
          note: note.trim(),
        });
        notify.success(`Đã sửa điểm danh của ${dialog.row.name}`);
      }
      setDialog(null);
      attendance.reload();
    } catch (error) {
      notify.error(error, "Không thể lưu điểm danh");
    } finally {
      setSaving(false);
    }
  };

  const undo = async (row: RollRow) => {
    if (!row.entry) return;
    try {
      await api.delete(`/pr/attendance/${row.entry.id}`);
      notify.success(`Đã hủy điểm danh của ${row.name}`);
      attendance.reload();
    } catch (error) {
      notify.error(error, "Không thể hủy điểm danh");
      return false;
    }
  };

  return (
    <>
      <PageHeader
        title="Điểm danh PR/KTV"
        description={`Ngày kinh doanh ${formatDate(date)}${isToday ? " (hôm nay)" : ""}`}
        info="Mỗi PR/KTV được điểm danh một lần mỗi ngày kinh doanh (06:00 hôm đó đến 06:00 hôm sau): bấm “Vào” khi đến, “Ra” khi về. Ngày đã qua thì nhập giờ vào bằng tay. Thêm người mới ở Thống kê PR."
        actions={
          <Input
            type="date"
            aria-label="Ngày kinh doanh"
            className="w-full md:w-44"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Điểm danh</CardTitle>
          <CardDescription>
            {attendance.loading
              ? "Đang tải…"
              : `${formatNumber(attendance.total ?? attendance.data.length)} người đã điểm danh${
                  staff.total !== null ? ` · danh sách có ${formatNumber(staff.total)} người đang làm` : ""
                }`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="md:max-w-64">
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

          <ListLimitNotice
            shown={staff.data.length}
            total={staff.total}
            noun="người"
            hint="Danh sách PR/KTV quá dài; tìm theo tên hoặc mã."
          />
          <ListLimitNotice
            shown={attendance.data.length}
            total={attendance.total}
            noun="lượt điểm danh"
            hint="Ngày này có quá nhiều lượt điểm danh để hiện hết."
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR/KTV</TableHead>
                <TableHead className={SHOW_FROM.sm}>Giờ vào</TableHead>
                <TableHead className={SHOW_FROM.sm}>Giờ ra</TableHead>
                <TableHead className={SHOW_FROM.md}>Ghi chú</TableHead>
                <TableHead className={SHOW_FROM.lg}>Người điểm danh</TableHead>
                <TableHead className="text-right">{canEdit ? "Thao tác" : "Trạng thái"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton columns={["", SHOW_FROM.sm, SHOW_FROM.sm, SHOW_FROM.md, SHOW_FROM.lg, ""]} />
              ) : shown.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={ClipboardCheckIcon}
                  title={keyword ? "Không tìm thấy PR/KTV" : "Chưa có PR/KTV nào"}
                />
              ) : (
                shown.map((row) => {
                  const { entry } = row;
                  const busy = busyId === row.prStaffId;
                  return (
                    <TableRow key={row.prStaffId} className={cn(!entry && "text-muted-foreground")}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className={cn("font-medium", entry && "text-foreground")}>
                            {row.name}
                            {row.code && <span className="ml-1 text-xs text-muted-foreground">({row.code})</span>}
                          </span>
                          <span className={cn("text-xs text-muted-foreground tabular-nums", ONLY_NARROW)}>
                            {entry
                              ? `Vào ${formatTime(entry.checkInAt)}${entry.checkOutAt ? ` · ra ${formatTime(entry.checkOutAt)}` : ""}`
                              : "Chưa điểm danh"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>
                        {entry ? formatTime(entry.checkInAt) : "—"}
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>
                        {entry?.checkOutAt ? formatTime(entry.checkOutAt) : "—"}
                      </TableCell>
                      <TableCell className={cn("max-w-56 truncate", SHOW_FROM.md)}>{entry?.note || "—"}</TableCell>
                      <TableCell className={SHOW_FROM.lg}>{entry?.createdBy?.fullName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {!entry ? (
                            canEdit ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => (isToday ? checkInNow(row) : openDialog({ kind: "check-in", row }))}
                              >
                                {busy ? <Spinner data-icon="inline-start" /> : <LogInIcon data-icon="inline-start" />}
                                Vào
                              </Button>
                            ) : (
                              <Badge variant="outline">Chưa điểm danh</Badge>
                            )
                          ) : !entry.checkOutAt ? (
                            canEdit && isToday ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => checkOutNow(row, entry)}
                              >
                                {busy ? <Spinner data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />}
                                Ra
                              </Button>
                            ) : (
                              <Badge variant={isToday ? "success" : "warning"}>
                                {isToday ? "Đang làm" : "Chưa chấm ra"}
                              </Badge>
                            )
                          ) : (
                            <Badge variant="secondary">Đã về</Badge>
                          )}
                          {canEdit && entry && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${row.name}`}>
                                  <MoreHorizontalIcon />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem onSelect={() => openDialog({ kind: "edit", row, entry })}>
                                    <PencilIcon />
                                    Sửa giờ, ghi chú
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                  <DropdownMenuItem variant="destructive" onSelect={() => setUndoing(row)}>
                                    <Undo2Icon />
                                    Hủy điểm danh
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && !saving && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveDialog} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "check-in" ? "Điểm danh" : "Sửa điểm danh"} – {dialog?.row.name}
              </DialogTitle>
              <DialogDescription>
                Ngày kinh doanh {formatDate(date)}: giờ vào phải từ 06:00 hôm đó đến trước 06:00 hôm sau.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={(submitted && !checkIn) || undefined}>
                  <FieldLabel htmlFor="pr-check-in">Giờ vào</FieldLabel>
                  <Input
                    id="pr-check-in"
                    type="datetime-local"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                  {submitted && !checkIn && <FieldError>Vui lòng nhập giờ vào</FieldError>}
                </Field>
                {dialog?.kind === "edit" && (
                  <Field data-invalid={timesInvalid || undefined}>
                    <FieldLabel htmlFor="pr-check-out">Giờ ra</FieldLabel>
                    <Input
                      id="pr-check-out"
                      type="datetime-local"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                    />
                    {timesInvalid ? (
                      <FieldError>Giờ ra phải sau giờ vào</FieldError>
                    ) : (
                      <FieldDescription>Bỏ trống nếu chưa về.</FieldDescription>
                    )}
                  </Field>
                )}
              </div>
              <Field>
                <FieldLabel htmlFor="pr-attendance-note">Ghi chú</FieldLabel>
                <Textarea
                  id="pr-attendance-note"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={saving}>
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
        open={!!undoing}
        onOpenChange={(open) => !open && setUndoing(null)}
        title={`Hủy điểm danh của ${undoing?.name ?? ""}?`}
        description="Lượt điểm danh ngày này bị xóa; có thể điểm danh lại."
        confirmLabel="Hủy điểm danh"
        destructive
        onConfirm={async () => {
          if (undoing) return undo(undoing);
        }}
      />
    </>
  );
}
