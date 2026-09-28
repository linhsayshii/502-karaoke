"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api, { setSession } from "@/lib/api";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const notify = useNotify();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSubmitted(false);
  }, [open]);

  const tooShort = newPassword.length < 6;
  const mismatch = newPassword !== confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!oldPassword || tooShort || mismatch) return;
    setSaving(true);
    try {
      // The new password ends the other sessions; this one continues with a fresh session.
      const res = await api.post("/auth/change-password", { oldPassword, newPassword });
      setSession(res.data.access_token, res.data.sessionExpiresAt);
      notify.success("Đổi mật khẩu thành công");
      onOpenChange(false);
    } catch (error) {
      notify.error(error, "Không thể đổi mật khẩu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Đổi mật khẩu</DialogTitle>
            <DialogDescription>Nhập mật khẩu hiện tại và mật khẩu mới (ít nhất 6 ký tự).</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={(submitted && !oldPassword) || undefined}>
              <FieldLabel htmlFor="old-pass">Mật khẩu hiện tại</FieldLabel>
              <Input
                id="old-pass"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                aria-invalid={(submitted && !oldPassword) || undefined}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </Field>
            <Field data-invalid={(submitted && tooShort) || undefined}>
              <FieldLabel htmlFor="new-pass">Mật khẩu mới</FieldLabel>
              <Input
                id="new-pass"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                aria-invalid={(submitted && tooShort) || undefined}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {submitted && tooShort && <FieldError>Mật khẩu mới phải có ít nhất 6 ký tự</FieldError>}
            </Field>
            <Field data-invalid={(submitted && mismatch) || undefined}>
              <FieldLabel htmlFor="confirm-pass">Nhập lại mật khẩu mới</FieldLabel>
              <Input
                id="confirm-pass"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                aria-invalid={(submitted && mismatch) || undefined}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {submitted && mismatch && <FieldError>Mật khẩu nhập lại không khớp</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Cập nhật
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
