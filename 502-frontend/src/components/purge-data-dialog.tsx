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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";

type Scope = "branch" | "all";

// HĐQT only: wipes the data of the branch being viewed, or of the whole
// system, after the account's own password is typed again.
export function PurgeDataDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const notify = useNotify();
  const { branches } = useAuth();
  const branchCode = useBranchCode();
  const branchName = branches.find((b) => b.code === branchCode)?.name ?? branchCode;
  const [scope, setScope] = useState<Scope>("branch");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope("branch");
    setPassword("");
    setSubmitted(false);
  }, [open]);

  const invalid = submitted && !password;

  const confirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!password) return;
    setPending(true);
    try {
      const res = await api.post<{ message: string }>("/admin/purge", {
        scope,
        branch: scope === "branch" ? branchCode : undefined,
        password,
      });
      notify.success(res.data.message);
      onOpenChange(false);
      // Every screen shows data that no longer exists.
      window.location.reload();
    } catch (error) {
      notify.error(error, "Không thể xóa dữ liệu");
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa sạch dữ liệu</AlertDialogTitle>
          <AlertDialogDescription>
            Xóa toàn bộ hóa đơn, phiếu kho, sổ quỹ, hàng hóa, danh mục và phòng. Tài khoản và danh sách cơ sở được giữ
            lại. Không thể khôi phục.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          value={scope}
          onValueChange={(value) => value && setScope(value as Scope)}
          className="w-full"
        >
          <ToggleGroupItem value="branch" className="flex-1">
            {branchName}
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="flex-1">
            Toàn bộ hệ thống
          </ToggleGroupItem>
        </ToggleGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="purge-password">Nhập lại mật khẩu để xác nhận</FieldLabel>
          <Input
            id="purge-password"
            type="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={invalid || undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          {invalid && <FieldError>Vui lòng nhập mật khẩu</FieldError>}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy bỏ</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending && <Spinner data-icon="inline-start" />}
            {scope === "all" ? "Xóa toàn bộ hệ thống" : `Xóa dữ liệu ${branchName}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
