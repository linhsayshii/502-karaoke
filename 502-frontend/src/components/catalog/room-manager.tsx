"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Trash2, Wrench, CheckCircle2 } from "lucide-react";
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
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatMoney } from "@/lib/format";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import type { Room, RoomStatus } from "@/lib/types";

const STATUS_LABELS: Record<RoomStatus, string> = {
  AVAILABLE: "Trống",
  ACTIVE: "Đang hát",
  MAINTENANCE: "Bảo trì",
};

interface RoomForm {
  name: string;
  type: string;
  pricePerHour: string;
}

const EMPTY_FORM: RoomForm = { name: "", type: "NORMAL", pricePerHour: "" };

export function RoomManager() {
  const branch = useBranchCode();
  const notify = useNotify();
  const { data: rooms, reload: load } = useApiData<Room[]>(
    "/rooms",
    { branch },
    [],
    "Không thể tải danh sách phòng",
  );
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const [form, setForm] = useState<RoomForm>(EMPTY_FORM);

  const openForm = (room: Room | "new") => {
    setEditing(room);
    setForm(
      room === "new"
        ? EMPTY_FORM
        : { name: room.name, type: room.type, pricePerHour: String(Number(room.pricePerHour)) },
    );
  };

  const save = async () => {
    const body = {
      name: form.name.trim(),
      type: form.type,
      pricePerHour: Number(form.pricePerHour),
    };
    if (!body.name || !(body.pricePerHour >= 0) || form.pricePerHour === "") {
      notify.error(null, "Vui lòng nhập tên phòng và giá giờ hợp lệ");
      return;
    }
    try {
      if (editing === "new") {
        await api.post("/rooms", body, { params: { branch } });
        notify.success("Đã thêm phòng mới");
      } else if (editing) {
        await api.patch(`/rooms/${editing.id}`, body);
        notify.success("Đã cập nhật phòng");
      }
      setEditing(null);
      load();
    } catch (error) {
      notify.error(error, "Không thể lưu phòng");
    }
  };

  const toggleMaintenance = async (room: Room) => {
    try {
      await api.patch(`/rooms/${room.id}`, {
        status: room.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE",
      });
      load();
    } catch (error) {
      notify.error(error, "Không thể đổi trạng thái phòng");
    }
  };

  const remove = async (room: Room) => {
    if (!window.confirm(`Xóa phòng ${room.name}?`)) return;
    try {
      await api.delete(`/rooms/${room.id}`);
      notify.success("Đã xóa phòng");
      load();
    } catch (error) {
      notify.error(error, "Không thể xóa phòng");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Danh sách phòng</CardTitle>
          <CardDescription>Phòng hát và giá giờ của cơ sở.</CardDescription>
        </div>
        <Button size="sm" onClick={() => openForm("new")}>
          <Plus className="mr-2 h-4 w-4" /> Thêm phòng
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên phòng</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Giá giờ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-[150px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.id}>
                <TableCell className="font-medium">{room.name}</TableCell>
                <TableCell>
                  <Badge variant={room.type === "VIP" ? "default" : "secondary"}>{room.type}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatMoney(room.pricePerHour)}</TableCell>
                <TableCell>{STATUS_LABELS[room.status]}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openForm(room)} title="Sửa">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {room.status !== "ACTIVE" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleMaintenance(room)}
                      title={room.status === "MAINTENANCE" ? "Mở lại phòng" : "Chuyển sang bảo trì"}
                    >
                      {room.status === "MAINTENANCE" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(room)}
                    className="text-red-500 hover:bg-red-50 hover:text-red-700"
                    title="Xóa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rooms.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Chưa có phòng nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Thêm phòng mới" : "Sửa phòng"}</DialogTitle>
            <DialogDescription>Tên phòng nên bắt đầu bằng số tầng, ví dụ P101.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Tên phòng</Label>
              <Input
                className="col-span-3"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Loại</Label>
              <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Thường</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Giá giờ</Label>
              <Input
                className="col-span-3"
                type="number"
                min={0}
                value={form.pricePerHour}
                onChange={(e) => setForm({ ...form, pricePerHour: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
