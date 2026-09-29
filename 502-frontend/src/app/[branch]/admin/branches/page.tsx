"use client";

import { useState } from "react";
import { Building2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, PowerIcon, PowerOffIcon } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TableEmpty } from "@/components/data-states";
import { PageHeader } from "@/components/layout/page-header";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { can } from "@/lib/permissions";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { Branch } from "@/lib/types";
import { cn } from "@/lib/utils";

const CODE_RE = /^[a-z0-9-]{2,20}$/;

interface BranchForm {
  code: string;
  name: string;
  address: string;
}

// Chain manager manages branches; HĐQT sees them read only (route guard + backend @Roles).
export default function BranchesPage() {
  const { user, branches, reloadBranches } = useAuth();
  const canEdit = can(user, "branches");
  const notify = useNotify();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [form, setForm] = useState<BranchForm>({ code: "", name: "", address: "" });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);

  const isNew = editing === "new";
  const codeInvalid = submitted && isNew && !CODE_RE.test(form.code.trim().toLowerCase());
  const nameInvalid = submitted && !form.name.trim();

  const openForm = (branch: Branch | "new") => {
    setEditing(branch);
    setSubmitted(false);
    setForm(
      branch === "new"
        ? { code: "", name: "", address: "" }
        : { code: branch.code, name: branch.name, address: branch.address ?? "" },
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!form.name.trim() || (isNew && !CODE_RE.test(form.code.trim().toLowerCase()))) return;
    setSaving(true);
    try {
      if (isNew) {
        await api.post("/branches", {
          code: form.code.trim().toLowerCase(),
          name: form.name.trim(),
          address: form.address.trim() || undefined,
        });
        notify.success(`Đã thêm ${form.name.trim()}`);
      } else if (editing) {
        await api.patch(`/branches/${editing.id}`, { name: form.name.trim(), address: form.address.trim() });
        notify.success(`Đã cập nhật ${form.name.trim()}`);
      }
      setEditing(null);
      await reloadBranches();
    } catch (error) {
      notify.error(error, "Không thể lưu cơ sở");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (branch: Branch, active: boolean) => {
    try {
      await api.patch(`/branches/${branch.id}`, { active });
      notify.success(active ? `${branch.name} hoạt động lại` : `${branch.name} đã ngừng hoạt động`);
      await reloadBranches();
    } catch (error) {
      notify.error(error, "Không thể cập nhật cơ sở");
      return false;
    }
  };

  return (
    <>
      <PageHeader
        title="Cơ sở"
        info="Các cơ sở trong chuỗi. Mã cơ sở dùng trên đường dẫn (vd /cs1/...) và không đổi được."
        actions={
          canEdit && (
            <Button onClick={() => openForm("new")}>
              <PlusIcon data-icon="inline-start" />
              Thêm cơ sở
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Danh sách cơ sở</CardTitle>
          <CardDescription>Cơ sở ngừng hoạt động vẫn giữ nguyên dữ liệu.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={SHOW_FROM.xs}>Mã</TableHead>
                <TableHead>Tên cơ sở</TableHead>
                <TableHead className={SHOW_FROM.sm}>Địa chỉ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableEmpty colSpan={5} icon={Building2Icon} title="Chưa có cơ sở nào" />
              ) : (
                branches.map((b) => (
                  <TableRow key={b.id} className={cn(!b.active && "text-muted-foreground")}>
                    <TableCell className={cn("font-mono", SHOW_FROM.xs)}>{b.code}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">{b.name}</div>
                      {b.address && <div className={cn("text-xs text-muted-foreground", ONLY_NARROW)}>{b.address}</div>}
                    </TableCell>
                    <TableCell className={cn("max-w-72 truncate", SHOW_FROM.sm)}>{b.address || "—"}</TableCell>
                    <TableCell>
                      {b.active ? (
                        <Badge variant="success">Đang hoạt động</Badge>
                      ) : (
                        <Badge variant="outline">Ngừng hoạt động</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${b.name}`}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => openForm(b)}>
                                <PencilIcon />
                                Sửa
                              </DropdownMenuItem>
                              {b.active ? (
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(b)}>
                                  <PowerOffIcon />
                                  Ngừng hoạt động
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => setActive(b, true)}>
                                  <PowerIcon />
                                  Hoạt động lại
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{isNew ? "Thêm cơ sở" : "Sửa cơ sở"}</DialogTitle>
              <DialogDescription>
                Cơ sở mới chưa có phòng, mặt hàng và nhân viên; thêm trong Cài đặt bán hàng và Quản trị sau khi tạo.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={codeInvalid || undefined}>
                <FieldLabel htmlFor="branch-code">Mã cơ sở</FieldLabel>
                <Input
                  id="branch-code"
                  placeholder="vd: cs5"
                  autoCapitalize="none"
                  value={form.code}
                  disabled={!isNew}
                  aria-invalid={codeInvalid || undefined}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
                {codeInvalid ? (
                  <FieldError>2–20 ký tự: chữ thường, số hoặc dấu gạch ngang</FieldError>
                ) : (
                  <FieldDescription>Dùng trên đường dẫn, không đổi được sau khi tạo.</FieldDescription>
                )}
              </Field>
              <Field data-invalid={nameInvalid || undefined}>
                <FieldLabel htmlFor="branch-name">Tên cơ sở</FieldLabel>
                <Input
                  id="branch-name"
                  value={form.name}
                  aria-invalid={nameInvalid || undefined}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {nameInvalid && <FieldError>Vui lòng nhập tên cơ sở</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="branch-address">Địa chỉ</FieldLabel>
                <Input
                  id="branch-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
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
        open={!!deactivating}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Ngừng hoạt động ${deactivating?.name ?? ""}?`}
        description="Cơ sở vẫn giữ nguyên dữ liệu và có thể hoạt động lại bất cứ lúc nào."
        confirmLabel="Ngừng hoạt động"
        destructive
        onConfirm={async () => {
          if (deactivating) return setActive(deactivating, false);
        }}
      />
    </>
  );
}
