"use client";

import { useEffect, useState } from "react";
import { PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { FloorStaff, Room } from "@/lib/types";

const NONE = "none";

// Opens a session on a free room; CSKH / phục vụ can be changed later.
export function OpenRoomDialog({
  room,
  staff,
  onOpenChange,
  onOpened,
}: {
  room: Room | null;
  staff: FloorStaff[];
  onOpenChange: (open: boolean) => void;
  onOpened: (orderId: number) => void;
}) {
  const notify = useNotify();
  const [cskhId, setCskhId] = useState(NONE);
  const [serverId, setServerId] = useState(NONE);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (room) {
      setCskhId(NONE);
      setServerId(NONE);
    }
  }, [room]);

  const cskhStaff = staff.filter((s) => s.position === "CSKH");
  const serverStaff = staff.filter((s) => s.position === "SERVER");

  const open = async () => {
    if (!room) return;
    setOpening(true);
    try {
      const res = await api.post<{ id: number }>("/orders", {
        roomId: room.id,
        cskhId: cskhId === NONE ? undefined : Number(cskhId),
        serverId: serverId === NONE ? undefined : Number(serverId),
      });
      notify.success(`Phòng ${room.name} bắt đầu tính giờ`);
      onOpened(res.data.id);
    } catch (error) {
      notify.error(error, "Không thể mở phòng");
    } finally {
      setOpening(false);
    }
  };

  const staffSelect = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    people: FloorStaff[],
  ) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NONE}>Chưa chọn</SelectItem>
            {people.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );

  return (
    <Dialog open={!!room} onOpenChange={(next) => !opening && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mở phòng {room?.name}</DialogTitle>
          <DialogDescription>
            Giá {formatMoney(room?.pricePerHour)}/giờ, chốt tại lúc mở phòng. Nhân viên phụ trách có thể đổi sau.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {staffSelect("open-cskh", "CSKH", cskhId, setCskhId, cskhStaff)}
          {staffSelect("open-server", "Phục vụ", serverId, setServerId, serverStaff)}
          {staff.length === 0 && (
            <FieldDescription>
              Cơ sở chưa có nhân viên CSKH/phục vụ. Quản lý có thể thêm trong Quản trị → Tài khoản.
            </FieldDescription>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={opening}>
            Hủy
          </Button>
          <Button onClick={open} disabled={opening}>
            {opening ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
            Mở phòng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
