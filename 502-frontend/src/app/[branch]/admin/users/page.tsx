"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { KeyRound, Lock, LockOpen, Pencil, Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { POSITION_LABELS, ROLE_LABELS, can } from "@/lib/permissions";
import type { ManagedUser, Role, StaffPosition } from "@/lib/types";

const ALL = "ALL";
const NONE = "none";
const BRANCH_MANAGEABLE: Role[] = ["CASHIER", "STAFF"];

interface UserForm {
  fullName: string;
  username: string;
  password: string;
  phone: string;
  role: Role;
  position: StaffPosition | typeof NONE;
  branchId: string;
}

export default function UsersPage() {
  const branch = useBranchCode();
  const { user: me, branches } = useAuth();
  const notify = useNotify();
  const isChainManager = can(me, "branch.switch");
  const assignableRoles: Role[] = isChainManager
    ? ["CHAIN_MANAGER", "BRANCH_MANAGER", "CASHIER", "STAFF"]
    : BRANCH_MANAGEABLE;

  const [branchFilter, setBranchFilter] = useState(branch);
  const [showInactive, setShowInactive] = useState(false);
  const { data: users, reload: load } = useApiData<ManagedUser[]>(
    "/users",
    {
      branch: isChainManager && branchFilter !== ALL ? branchFilter : undefined,
      includeInactive: showInactive,
    },
    [],
    "Không thể tải danh sách tài khoản",
  );
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const currentBranchId = branches.find((b) => b.code === branch)?.id;

  const canManage = (u: ManagedUser) =>
    isChainManager || (u.branchId === me?.branchId && BRANCH_MANAGEABLE.includes(u.role));

  const openForm = (target: ManagedUser | "new") => {
    setEditing(target);
    setForm(
      target === "new"
        ? {
            fullName: "",
            username: "",
            password: "",
            phone: "",
            role: "STAFF",
            position: NONE,
            branchId: String(currentBranchId ?? ""),
          }
        : {
            fullName: target.fullName,
            username: target.username,
            password: "",
            phone: target.phone ?? "",
            role: target.role,
            position: target.position ?? NONE,
            branchId: target.branchId ? String(target.branchId) : "",
          },
    );
  };

  const save = async () => {
    if (!form || !editing) return;
    if (!form.fullName.trim()) {
      notify.error(null, "Vui lòng nhập họ tên");
      return;
    }
    const assignment = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      position: form.position === NONE ? null : form.position,
      // Branch managers can only place accounts in their own branch (server enforces it).
      branchId:
        form.role === "CHAIN_MANAGER" ? null : isChainManager ? Number(form.branchId) || null : me?.branchId,
    };
    try {
      if (editing === "new") {
        await api.post("/users", {
          ...assignment,
          username: form.username.trim().toLowerCase(),
          password: form.password || undefined,
        });
        notify.success("Đã tạo tài khoản");
      } else {
        await api.patch(`/users/${editing.id}`, assignment);
        notify.success("Đã cập nhật tài khoản");
      }
      setEditing(null);
      load();
    } catch (error) {
      notify.error(error, "Không thể lưu tài khoản");
    }
  };

  const setActive = async (target: ManagedUser, active: boolean) => {
    if (!active && !window.confirm(`Khóa tài khoản ${target.fullName}? Tài khoản sẽ không đăng nhập được.`)) {
      return;
    }
    try {
      if (active) await api.patch(`/users/${target.id}`, { active: true });
      else await api.delete(`/users/${target.id}`);
      load();
    } catch (error) {
      notify.error(error, "Không thể cập nhật tài khoản");
    }
  };

  const resetPassword = async () => {
    if (!passwordFor) return;
    if (newPassword.length < 6) {
      notify.error(null, "Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    try {
      await api.post(`/users/${passwordFor.id}/reset-password`, { password: newPassword });
      notify.success(`Đã đặt mật khẩu cho ${passwordFor.fullName}`);
      setPasswordFor(null);
      setNewPassword("");
      load();
    } catch (error) {
      notify.error(error, "Không thể đặt mật khẩu");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Tài khoản</CardTitle>
          <CardDescription>
            Mỗi nhân viên là một tài khoản; vai trò quyết định quyền. Nhân viên CSKH/phục vụ không cần
            mật khẩu nếu không đăng nhập.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            {isChainManager && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả cơ sở</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.code}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="showInactive"
                checked={showInactive}
                onCheckedChange={(checked) => setShowInactive(checked === true)}
              />
              <Label htmlFor="showInactive" className="font-normal">
                Hiện tài khoản đã khóa
              </Label>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => openForm("new")}>
          <Plus className="mr-2 h-4 w-4" /> Thêm tài khoản
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Tên đăng nhập</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Vị trí</TableHead>
              <TableHead>Cơ sở</TableHead>
              <TableHead>Điện thoại</TableHead>
              <TableHead>Đăng nhập</TableHead>
              <TableHead className="w-[130px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.active ? "" : "opacity-60"}>
                <TableCell className="font-medium">
                  {u.fullName}
                  {u.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">(bạn)</span>}
                </TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "STAFF" ? "secondary" : "default"}>{ROLE_LABELS[u.role]}</Badge>
                </TableCell>
                <TableCell>{u.position ? POSITION_LABELS[u.position] : "—"}</TableCell>
                <TableCell>{u.branch?.name ?? "Toàn chuỗi"}</TableCell>
                <TableCell>{u.phone ?? ""}</TableCell>
                <TableCell>
                  {!u.active ? (
                    <Badge variant="outline">Đã khóa</Badge>
                  ) : u.hasPassword ? (
                    <span className="text-sm text-green-700">Có mật khẩu</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Chưa có mật khẩu</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canManage(u) && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openForm(u)} title="Sửa">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPasswordFor(u);
                          setNewPassword("");
                        }}
                        title="Đặt mật khẩu"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {u.id !== me?.id &&
                        (u.active ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setActive(u, false)}
                            title="Khóa tài khoản"
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" onClick={() => setActive(u, true)} title="Mở khóa">
                            <LockOpen className="h-4 w-4" />
                          </Button>
                        ))}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Không có tài khoản nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Thêm tài khoản" : "Sửa tài khoản"}</DialogTitle>
            <DialogDescription>
              {editing === "new"
                ? "Bỏ trống mật khẩu nếu nhân viên chưa cần đăng nhập; có thể đặt sau."
                : "Tên đăng nhập không đổi được. Dùng nút chìa khóa để đặt lại mật khẩu."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Họ tên</Label>
                <Input
                  className="col-span-3"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Tên đăng nhập</Label>
                <Input
                  className="col-span-3"
                  placeholder="chữ thường, số, dấu . hoặc _"
                  value={form.username}
                  disabled={editing !== "new"}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              {editing === "new" && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Mật khẩu</Label>
                  <Input
                    className="col-span-3"
                    type="password"
                    placeholder="Ít nhất 6 ký tự (không bắt buộc)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Điện thoại</Label>
                <Input
                  className="col-span-3"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Vai trò</Label>
                <Select value={form.role} onValueChange={(role) => setForm({ ...form, role: role as Role })}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Vị trí</Label>
                <Select
                  value={form.position}
                  onValueChange={(position) =>
                    setForm({ ...form, position: position as StaffPosition | typeof NONE })
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Không phục vụ phòng</SelectItem>
                    <SelectItem value="CSKH">{POSITION_LABELS.CSKH}</SelectItem>
                    <SelectItem value="SERVER">{POSITION_LABELS.SERVER}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isChainManager && form.role !== "CHAIN_MANAGER" && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Cơ sở</Label>
                  <Select value={form.branchId} onValueChange={(branchId) => setForm({ ...form, branchId })}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Chọn cơ sở" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordFor} onOpenChange={(open) => !open && setPasswordFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đặt mật khẩu – {passwordFor?.fullName}</DialogTitle>
            <DialogDescription>
              Tên đăng nhập: {passwordFor?.username}. Báo mật khẩu mới cho nhân viên và nhắc họ đổi sau khi
              đăng nhập.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && resetPassword()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordFor(null)}>
              Hủy
            </Button>
            <Button onClick={resetPassword}>Lưu mật khẩu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
