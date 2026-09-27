"use client";

import { useState } from "react";
import {
  CheckCircle2Icon,
  DoorOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExcelImportButton } from "@/components/excel-import/import-button";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatNumber } from "@/lib/format";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { Room, RoomStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<RoomStatus, { label: string; badge: "success" | "destructive" | "secondary" }> = {
  AVAILABLE: { label: "Trống", badge: "success" },
  ACTIVE: { label: "Đang hát", badge: "destructive" },
  MAINTENANCE: { label: "Bảo trì", badge: "secondary" },
};

interface RoomForm {
  name: string;
  type: string;
  pricePerHour: string;
}

const EMPTY_FORM: RoomForm = { name: "", type: "NORMAL", pricePerHour: "" };

// Rooms of the branch and their hourly price. A running session keeps the
// price it was opened with.
export function RoomManager() {
  const branch = useBranchCode();
  const notify = useNotify();
  const {
    data: rooms,
    loading,
    reload,
  } = useApiData<Room[]>("/rooms", { branch }, [], "Không thể tải danh sách phòng");
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [form, setForm] = useState<RoomForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);

  const openForm = (room: Room | "new") => {
    setEditing(room);
    setSubmitted(false);
    setForm(
      room === "new"
        ? EMPTY_FORM
        : { name: room.name, type: room.type, pricePerHour: String(Number(room.pricePerHour)) },
    );
  };

  const nameInvalid = submitted && !form.name.trim();
  const priceInvalid = submitted && (form.pricePerHour === "" || !(Number(form.pricePerHour) >= 0));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!form.name.trim() || form.pricePerHour === "" || !(Number(form.pricePerHour) >= 0)) return;
    const body = { name: form.name.trim(), type: form.type, pricePerHour: Number(form.pricePerHour) };
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/rooms", body, { params: { branch } });
        notify.success(`Đã thêm phòng ${body.name}`);
      } else if (editing) {
        await api.patch(`/rooms/${editing.id}`, body);
        notify.success(`Đã cập nhật phòng ${body.name}`);
      }
      setEditing(null);
      reload();
    } catch (error) {
      notify.error(error, "Không thể lưu phòng");
    } finally {
      setSaving(false);
    }
  };

  const toggleMaintenance = async (room: Room) => {
    try {
      await api.patch(`/rooms/${room.id}`, {
        status: room.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE",
      });
      notify.success(
        room.status === "MAINTENANCE" ? `Phòng ${room.name} đã mở lại` : `Phòng ${room.name} chuyển sang bảo trì`,
      );
      reload();
    } catch (error) {
      notify.error(error, "Không thể đổi trạng thái phòng");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/rooms/${deleting.id}`);
      notify.success(`Đã xóa phòng ${deleting.name}`);
      reload();
    } catch (error) {
      notify.error(error, "Không thể xóa phòng");
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phòng hát</CardTitle>
        <CardDescription>Tên phòng nên bắt đầu bằng số tầng (P101, P203…) để sơ đồ nhóm theo tầng.</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <ExcelImportButton type="rooms" size="sm" />
          <Button size="sm" onClick={() => openForm("new")}>
            <PlusIcon data-icon="inline-start" />
            Thêm phòng
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên phòng</TableHead>
              <TableHead className={SHOW_FROM.sm}>Loại</TableHead>
              <TableHead className={cn("text-right", SHOW_FROM.sm)}>Giá giờ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rooms.length === 0 ? (
              <TableSkeleton columns={["", SHOW_FROM.sm, SHOW_FROM.sm, "", ""]} rows={3} />
            ) : rooms.length === 0 ? (
              <TableEmpty
                colSpan={5}
                icon={DoorOpenIcon}
                title="Chưa có phòng nào"
                description="Thêm phòng đầu tiên để bắt đầu mở phòng cho khách."
              />
            ) : (
              rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{room.name}</div>
                    <div className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>
                      {room.type === "VIP" ? "VIP" : "Thường"} · {formatNumber(room.pricePerHour)} đ/giờ
                    </div>
                  </TableCell>
                  <TableCell className={SHOW_FROM.sm}>
                    <Badge variant={room.type === "VIP" ? "default" : "outline"}>
                      {room.type === "VIP" ? "VIP" : "Thường"}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.sm)}>
                    {formatNumber(room.pricePerHour)} đ
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[room.status].badge}>{STATUS[room.status].label}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Thao tác phòng ${room.name}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => openForm(room)}>
                            <PencilIcon />
                            Sửa
                          </DropdownMenuItem>
                          {room.status !== "ACTIVE" && (
                            <DropdownMenuItem onSelect={() => toggleMaintenance(room)}>
                              {room.status === "MAINTENANCE" ? <CheckCircle2Icon /> : <WrenchIcon />}
                              {room.status === "MAINTENANCE" ? "Mở lại phòng" : "Chuyển sang bảo trì"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(room)}>
                            <Trash2Icon />
                            Xóa phòng
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Thêm phòng" : "Sửa phòng"}</DialogTitle>
              <DialogDescription>
                Đổi giá giờ không ảnh hưởng phiên đang hát (giá đã chốt lúc mở phòng).
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor="room-name">Tên phòng</FieldLabel>
                <Input
                  id="room-name"
                  placeholder="VD: P101"
                  value={form.name}
                  aria-invalid={nameInvalid || undefined}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {nameInvalid && <FieldError>Vui lòng nhập tên phòng</FieldError>}
              </Field>
              <Field>
                <FieldLabel>Loại phòng</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={form.type}
                  onValueChange={(type) => type && setForm({ ...form, type })}
                  aria-label="Loại phòng"
                >
                  <ToggleGroupItem value="NORMAL">Thường</ToggleGroupItem>
                  <ToggleGroupItem value="VIP">VIP</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field data-invalid={priceInvalid || undefined}>
                <FieldLabel htmlFor="room-price">Giá giờ</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="room-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    placeholder="120000"
                    value={form.pricePerHour}
                    aria-invalid={priceInvalid || undefined}
                    onChange={(e) => setForm({ ...form, pricePerHour: e.target.value })}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>đ / giờ</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {priceInvalid ? (
                  <FieldError>Giá giờ phải là số không âm</FieldError>
                ) : (
                  <FieldDescription>Tiền giờ = số phút đã hát / 60 × giá giờ, làm tròn lên 1.000 đ.</FieldDescription>
                )}
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
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Xóa phòng ${deleting?.name ?? ""}?`}
        description="Chỉ xóa được phòng chưa từng có hóa đơn. Phòng đã có lịch sử hãy chuyển sang bảo trì."
        confirmLabel="Xóa phòng"
        destructive
        onConfirm={remove}
      />
    </Card>
  );
}
