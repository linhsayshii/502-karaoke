"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import type { EinvoiceDetail } from "@/lib/types";

// Sửa số: when the number was changed by hand on Minvoice (spec §7.3), or
// when it is missing because Minvoice's number clashed with one of ours.
export function EditNumberDialog({
  einvoice,
  open,
  onOpenChange,
  onSaved,
}: {
  einvoice: EinvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: EinvoiceDetail) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open && (
          <NumberForm
            einvoice={einvoice}
            onCancel={() => onOpenChange(false)}
            onDone={(row) => {
              onOpenChange(false);
              onSaved(row);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NumberForm({
  einvoice,
  onCancel,
  onDone,
}: {
  einvoice: EinvoiceDetail;
  onCancel: () => void;
  onDone: (row: EinvoiceDetail) => void;
}) {
  const notify = useNotify();
  const [value, setValue] = useState(einvoice.invoiceNumber ? String(einvoice.invoiceNumber) : "");
  const [saving, setSaving] = useState(false);
  const invoiceNumber = Number(value);
  const valid = Number.isInteger(invoiceNumber) && invoiceNumber >= 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const res = await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}/number`, { invoiceNumber });
      notify.success(`Đã sửa số hóa đơn thành ${invoiceNumber}`);
      onDone(res.data);
    } catch (error) {
      notify.error(error, "Không sửa được số hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Sửa số hóa đơn</DialogTitle>
        <DialogDescription>Chỉ dùng khi số trên Minvoice đã bị sửa tay. Số mới phải khớp với Minvoice.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="einvoice-number">Số hóa đơn</FieldLabel>
        <Input
          id="einvoice-number"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 9))}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Hủy
        </Button>
        <Button type="submit" disabled={saving || !valid}>
          {saving && <Spinner data-icon="inline-start" />}
          Lưu
        </Button>
      </DialogFooter>
    </form>
  );
}
