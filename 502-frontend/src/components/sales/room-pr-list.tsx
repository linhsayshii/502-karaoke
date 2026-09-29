"use client";

import { Fragment, useState } from "react";
import { LogOutIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNow } from "@/hooks/use-now";
import { formatElapsed, formatTime, minutesBetween, toDateTimeInput } from "@/lib/format";
import type { PrSession } from "@/lib/types";

export interface PrTimes {
  startAt: string; // ISO
  endAt: string | null;
}

// The PR/KTV visits of a room, in the bill card: time in – time out (or the
// live time of who is still sitting), with Ra / Sửa giờ / Xóa for who may.
// `onSave` and `onRemove` answer whether the change was saved; the dialog
// stays open when it was not.
export function RoomPrList({
  sessions,
  canEdit,
  onEnd,
  onSave,
  onRemove,
}: {
  sessions: PrSession[];
  canEdit: boolean;
  onEnd: (id: number) => void;
  onSave: (id: number, times: PrTimes) => Promise<boolean>;
  onRemove: (id: number) => Promise<boolean>;
}) {
  const now = useNow();
  const [editing, setEditing] = useState<PrSession | null>(null);
  const [form, setForm] = useState({ startAt: "", endAt: "" });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<PrSession | null>(null);

  const openEdit = (s: PrSession) => {
    setEditing(s);
    setForm({
      startAt: toDateTimeInput(new Date(s.startAt)),
      endAt: s.endAt ? toDateTimeInput(new Date(s.endAt)) : "",
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const saved = await onSave(editing.id, {
        startAt: new Date(form.startAt).toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
      });
      if (saved) setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có PR/KTV trong phòng.</p>
      ) : (
        <ItemGroup className="rounded-lg border">
          {sessions.map((s, index) => {
            const minutes = minutesBetween(s.startAt, s.endAt ? new Date(s.endAt) : now);
            return (
              <Fragment key={s.id}>
                {index > 0 && <ItemSeparator />}
                <Item size="sm" className="rounded-none px-3">
                  <ItemContent className="min-w-32">
                    <ItemTitle>
                      {s.prStaff.name}
                      {!s.endAt && <Badge variant="destructive">Đang ngồi</Badge>}
                    </ItemTitle>
                    <ItemDescription className="tabular-nums">
                      {formatTime(s.startAt)} – {s.endAt ? formatTime(s.endAt) : "…"} · {formatElapsed(minutes)}
                    </ItemDescription>
                  </ItemContent>
                  {canEdit && (
                    <ItemActions className="ml-auto">
                      {!s.endAt && (
                        <Button variant="outline" size="sm" onClick={() => onEnd(s.id)}>
                          <LogOutIcon data-icon="inline-start" />
                          Ra
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Sửa giờ ${s.prStaff.name}`}
                        onClick={() => openEdit(s)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa ${s.prStaff.name}`}
                        onClick={() => setRemoving(s)}
                      >
                        <Trash2Icon />
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              </Fragment>
            );
          })}
        </ItemGroup>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <form className="flex flex-col gap-6" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Sửa giờ {editing?.prStaff.name}</DialogTitle>
              <DialogDescription>Để trống giờ ra nếu PR vẫn còn trong phòng.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="pr-start">Giờ vào</FieldLabel>
                <Input
                  id="pr-start"
                  type="datetime-local"
                  required
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pr-end">Giờ ra</FieldLabel>
                <Input
                  id="pr-end"
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Xóa lượt của ${removing?.prStaff.name ?? ""}?`}
        description="Chỉ dùng khi gán nhầm. Lượt bị xóa không được tính giờ."
        confirmLabel="Xóa"
        destructive
        onConfirm={() => (removing ? onRemove(removing.id) : true)}
      />
    </>
  );
}
