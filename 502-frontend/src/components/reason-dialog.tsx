"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  // Defaults suit cancelling; other callers (e.g. a discount request) say what the note is.
  reasonLabel?: string;
  placeholder?: string;
  requiredMessage?: string;
  // Longest note the textarea takes, for a server that allows less than 500.
  maxLength?: number;
  // Return false to keep the dialog open (e.g. the call failed).
  onConfirm: (reason: string) => Promise<boolean | void>;
}

// Cancelling something that already moved money or stock: the reason is
// required and kept with the cancelled record.
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  reasonLabel = "Lý do hủy",
  placeholder = "Ví dụ: nhập nhầm số lượng",
  requiredMessage = "Vui lòng nhập lý do hủy",
  maxLength = 500,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const invalid = touched && !reason.trim();

  const confirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!reason.trim()) return;
    setPending(true);
    try {
      if ((await onConfirm(reason.trim())) !== false) onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {/* min-w-0: the textarea sizes to its text, so a long word (a pasted link) would
            widen the dialog's grid column and push the buttons off the screen. */}
        <Field data-invalid={invalid || undefined} className="min-w-0">
          <FieldLabel htmlFor="cancel-reason">{reasonLabel}</FieldLabel>
          <Textarea
            id="cancel-reason"
            placeholder={placeholder}
            value={reason}
            aria-invalid={invalid || undefined}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={maxLength}
          />
          {invalid && <FieldError>{requiredMessage}</FieldError>}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Đóng</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
