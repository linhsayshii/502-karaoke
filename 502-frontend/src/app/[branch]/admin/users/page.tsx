"use client";

import { useMemo, useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockIcon,
  LockOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { ExcelImportButton } from "@/components/excel-import/import-button";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { initials } from "@/lib/format";
import { POSITION_LABELS, REPORT_ACCESS_ROLES, ROLE_LABELS, can } from "@/lib/permissions";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { ManagedUser, Role, StaffPosition } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";
const NONE = "none";
const BRANCH_MANAGEABLE: Role[] = ["CASHIER", "STAFF"];
const MANAGER_ROLES: Role[] = ["CHAIN_MANAGER", "BRANCH_MANAGER"];
const USERNAME_RE = /^[a-z0-9._]{3,32}$/;

interface UserForm {
  fullName: string;
  username: string;
  password: string;
  phone: string;
  role: Role;
  position: StaffPosition | typeof NONE;
  managesPr: boolean;
  reportAccess: boolean;
  branchId: string;
}

function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        placeholder={placeholder}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export default function UsersPage() {
  const branch = useBranchCode();
  const { user: me, branches } = useAuth();
  const notify = useNotify();
  const isChainManager = me?.role === "CHAIN_MANAGER";
  // HĐQT sees the accounts of every branch, read only.
  const allBranches = can(me, "branch.switch");
  const canEdit = can(me, "users");
  const noBranchRole = (role: Role) => role === "CHAIN_MANAGER" || role === "BOARD";
  const assignableRoles: Role[] = isChainManager
    ? ["CHAIN_MANAGER", "BRANCH_MANAGER", "CASHIER", "STAFF", "BOARD"]
    : BRANCH_MANAGEABLE;

  const [branchFilter, setBranchFilter] = useState(branch);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const {
    data: users,
    loading,
    reload,
  } = useApiData<ManagedUser[]>(
    "/users",
    {
      branch: allBranches && branchFilter !== ALL ? branchFilter : undefined,
      includeInactive: showInactive,
    },
    [],
    "Không thể tải danh sách tài khoản",
  );
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [locking, setLocking] = useState<ManagedUser | null>(null);

  const currentBranchId = branches.find((b) => b.code === branch)?.id;
  const keyword = search.trim().toLowerCase();
  const shown = useMemo(
    () => users.filter((u) => !keyword || u.fullName.toLowerCase().includes(keyword) || u.username.includes(keyword)),
    [users, keyword],
  );

  const canManage = (u: ManagedUser) =>
    canEdit && (isChainManager || (u.branchId === me?.branchId && BRANCH_MANAGEABLE.includes(u.role)));

  const openForm = (target: ManagedUser | "new") => {
    setEditing(target);
    setSubmitted(false);
    setForm(
      target === "new"
        ? {
            fullName: "",
            username: "",
            password: "",
            phone: "",
            role: "STAFF",
            position: NONE,
            managesPr: false,
            reportAccess: false,
            branchId: String(currentBranchId ?? ""),
          }
        : {
            fullName: target.fullName,
            username: target.username,
            password: "",
            phone: target.phone ?? "",
            role: target.role,
            position: target.position ?? NONE,
            managesPr: target.managesPr,
            reportAccess: target.reportAccess,
            branchId: target.branchId ? String(target.branchId) : "",
          },
    );
  };

  const isNew = editing === "new";
  const invalid = form && {
    fullName: submitted && !form.fullName.trim(),
    username: submitted && isNew && !USERNAME_RE.test(form.username.trim().toLowerCase()),
    password: submitted && isNew && form.password !== "" && form.password.length < 6,
    branch: submitted && isChainManager && !noBranchRole(form.role) && !form.branchId,
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !editing || !invalid) return;
    setSubmitted(true);
    const bad =
      !form.fullName.trim() ||
      (isNew && !USERNAME_RE.test(form.username.trim().toLowerCase())) ||
      (isNew && form.password !== "" && form.password.length < 6) ||
      (isChainManager && !noBranchRole(form.role) && !form.branchId);
    if (bad) return;
    const assignment = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      position: form.position === NONE ? null : form.position,
      managesPr: form.managesPr,
      // Sent by the chain manager only: the server refuses it from anyone else.
      ...(isChainManager
        ? { reportAccess: REPORT_ACCESS_ROLES.includes(form.role) && form.reportAccess }
        : {}),
      // Branch managers can only place accounts in their own branch (server enforces it).
      branchId: noBranchRole(form.role) ? null : isChainManager ? Number(form.branchId) || null : me?.branchId,
    };
    setSaving(true);
    try {
      if (isNew) {
        await api.post("/users", {
          ...assignment,
          username: form.username.trim().toLowerCase(),
          password: form.password || undefined,
        });
        notify.success(`Đã tạo tài khoản ${form.username.trim().toLowerCase()}`);
      } else {
        await api.patch(`/users/${editing.id}`, assignment);
        notify.success(`Đã cập nhật ${assignment.fullName}`);
      }
      setEditing(null);
      reload();
    } catch (error) {
      notify.error(error, "Không thể lưu tài khoản");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (target: ManagedUser, active: boolean) => {
    try {
      if (active) await api.patch(`/users/${target.id}`, { active: true });
      else await api.delete(`/users/${target.id}`);
      notify.success(active ? `Đã mở khóa ${target.fullName}` : `Đã khóa ${target.fullName}`);
      reload();
    } catch (error) {
      notify.error(error, "Không thể cập nhật tài khoản");
      return false;
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordFor) return;
    setPasswordSubmitted(true);
    if (newPassword.length < 6) return;
    setSaving(true);
    try {
      await api.post(`/users/${passwordFor.id}/reset-password`, { password: newPassword });
      notify.success(`Đã đặt mật khẩu cho ${passwordFor.fullName}`);
      setPasswordFor(null);
      reload();
    } catch (error) {
      notify.error(error, "Không thể đặt mật khẩu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Tài khoản"
        info="Mỗi nhân viên là một tài khoản; vai trò quyết định quyền. Nhân viên CSKH/phục vụ không cần mật khẩu nếu không đăng nhập."
        actions={
          canEdit && (
            <>
              <ExcelImportButton type="users" />
              <Button onClick={() => openForm("new")}>
                <UserPlusIcon data-icon="inline-start" />
                Thêm tài khoản
              </Button>
            </>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Danh sách tài khoản</CardTitle>
          <CardDescription>
            {!canEdit
              ? "Tài khoản của toàn chuỗi (chỉ xem)."
              : isChainManager
                ? "Quản lý hệ thống quản lý mọi tài khoản của chuỗi."
                : "Quản lý cơ sở quản lý tài khoản thu ngân và nhân viên của cơ sở mình."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <InputGroup className="md:max-w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Tìm tên hoặc tên đăng nhập"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm tài khoản"
              />
            </InputGroup>
            {allBranches && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="md:w-48" aria-label="Cơ sở">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={ALL}>Tất cả cơ sở</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.code}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2 md:ml-auto">
              <Switch id="show-locked" checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor="show-locked" className="font-normal">
                Hiện tài khoản đã khóa
              </Label>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhân viên</TableHead>
                <TableHead className={SHOW_FROM.sm}>Vai trò</TableHead>
                <TableHead className={SHOW_FROM.md}>Vị trí</TableHead>
                <TableHead className={SHOW_FROM.md}>Cơ sở</TableHead>
                <TableHead className={SHOW_FROM.lg}>Điện thoại</TableHead>
                <TableHead className={SHOW_FROM.sm}>Đăng nhập</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && users.length === 0 ? (
                <TableSkeleton
                  columns={["", SHOW_FROM.sm, SHOW_FROM.md, SHOW_FROM.md, SHOW_FROM.lg, SHOW_FROM.sm, ""]}
                />
              ) : shown.length === 0 ? (
                <TableEmpty colSpan={7} icon={UsersIcon} title="Không có tài khoản nào" />
              ) : (
                shown.map((u) => (
                  <TableRow key={u.id} className={cn(!u.active && "text-muted-foreground")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">{initials(u.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {u.fullName}
                            {u.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">(bạn)</span>}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {u.username}
                            <span className={ONLY_NARROW}>
                              {" "}
                              · {ROLE_LABELS[u.role]}
                              {u.managesPr && " · quản lý PR/KTV"}
                              {u.reportAccess && " · trang báo cáo"}
                              {!u.active && " · đã khóa"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={SHOW_FROM.sm}>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={u.role === "STAFF" ? "secondary" : "default"}>{ROLE_LABELS[u.role]}</Badge>
                        {u.managesPr && <Badge variant="outline">Quản lý PR/KTV</Badge>}
                        {u.reportAccess && <Badge variant="outline">Trang báo cáo</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={SHOW_FROM.md}>{u.position ? POSITION_LABELS[u.position] : "—"}</TableCell>
                    <TableCell className={SHOW_FROM.md}>{u.branch?.name ?? "Toàn chuỗi"}</TableCell>
                    <TableCell className={cn("tabular-nums", SHOW_FROM.lg)}>{u.phone || "—"}</TableCell>
                    <TableCell className={SHOW_FROM.sm}>
                      {!u.active ? (
                        <Badge variant="outline">Đã khóa</Badge>
                      ) : u.hasPassword ? (
                        <Badge variant="success">Có mật khẩu</Badge>
                      ) : (
                        <Badge variant="secondary">Chưa có mật khẩu</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage(u) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Thao tác ${u.fullName}`}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => openForm(u)}>
                                <PencilIcon />
                                Sửa
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  setPasswordFor(u);
                                  setNewPassword("");
                                  setPasswordSubmitted(false);
                                }}
                              >
                                <KeyRoundIcon />
                                Đặt mật khẩu
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            {u.id !== me?.id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                  {u.active ? (
                                    <DropdownMenuItem variant="destructive" onSelect={() => setLocking(u)}>
                                      <LockIcon />
                                      Khóa tài khoản
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onSelect={() => setActive(u, true)}>
                                      <LockOpenIcon />
                                      Mở khóa
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuGroup>
                              </>
                            )}
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
        <DialogContent className="sm:max-w-lg">
          {form && invalid && (
            <form onSubmit={save} className="flex flex-col gap-6">
              <DialogHeader>
                <DialogTitle>{isNew ? "Thêm tài khoản" : "Sửa tài khoản"}</DialogTitle>
                <DialogDescription>
                  {isNew
                    ? "Bỏ trống mật khẩu nếu nhân viên chưa cần đăng nhập; có thể đặt sau."
                    : "Tên đăng nhập không đổi được. Dùng “Đặt mật khẩu” để đặt lại mật khẩu."}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field data-invalid={invalid.fullName || undefined}>
                  <FieldLabel htmlFor="user-name">Họ tên</FieldLabel>
                  <Input
                    id="user-name"
                    value={form.fullName}
                    aria-invalid={invalid.fullName || undefined}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                  {invalid.fullName && <FieldError>Vui lòng nhập họ tên</FieldError>}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={invalid.username || undefined}>
                    <FieldLabel htmlFor="user-username">Tên đăng nhập</FieldLabel>
                    <Input
                      id="user-username"
                      autoCapitalize="none"
                      placeholder="vd: tn1_cs1"
                      value={form.username}
                      disabled={!isNew}
                      aria-invalid={invalid.username || undefined}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                    />
                    {invalid.username ? (
                      <FieldError>3–32 ký tự: chữ thường, số, dấu . hoặc _</FieldError>
                    ) : (
                      isNew && <FieldDescription>Chữ thường, số, dấu . hoặc _</FieldDescription>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="user-phone">Điện thoại</FieldLabel>
                    <Input
                      id="user-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </Field>
                </div>
                {isNew && (
                  <Field data-invalid={invalid.password || undefined}>
                    <FieldLabel htmlFor="user-password">Mật khẩu</FieldLabel>
                    <PasswordInput
                      id="user-password"
                      placeholder="Ít nhất 6 ký tự (không bắt buộc)"
                      value={form.password}
                      invalid={invalid.password}
                      onChange={(password) => setForm({ ...form, password })}
                    />
                    {invalid.password && <FieldError>Mật khẩu phải có ít nhất 6 ký tự</FieldError>}
                  </Field>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="user-role">Vai trò</FieldLabel>
                    <Select value={form.role} onValueChange={(role) => setForm({ ...form, role: role as Role })}>
                      <SelectTrigger id="user-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {assignableRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="user-position">Vị trí</FieldLabel>
                    <Select
                      value={form.position}
                      onValueChange={(position) =>
                        setForm({ ...form, position: position as StaffPosition | typeof NONE })
                      }
                    >
                      <SelectTrigger id="user-position" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={NONE}>Không phục vụ phòng</SelectItem>
                          <SelectItem value="CSKH">{POSITION_LABELS.CSKH}</SelectItem>
                          <SelectItem value="SERVER">{POSITION_LABELS.SERVER}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {form.position === "SERVER" &&
                      (isNew ? form.password === "" : !editing?.hasPassword) && (
                        <FieldDescription className="text-warning">
                          Phục vụ cần mật khẩu để đăng nhập và gọi món cho phòng mình.
                        </FieldDescription>
                      )}
                  </Field>
                </div>
                {!noBranchRole(form.role) && (
                  <Field>
                    <FieldLabel htmlFor="user-manages-pr">Quản lý PR/KTV</FieldLabel>
                    <Select
                      value={form.managesPr ? "yes" : "no"}
                      onValueChange={(value) => setForm({ ...form, managesPr: value === "yes" })}
                    >
                      <SelectTrigger id="user-manages-pr" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="no">Không</SelectItem>
                          <SelectItem value="yes">Có – thêm, sửa danh sách và điểm danh PR/KTV</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {MANAGER_ROLES.includes(form.role) && (
                      <FieldDescription>Quản lý luôn quản lý được PR/KTV của cơ sở.</FieldDescription>
                    )}
                  </Field>
                )}
                {isChainManager && REPORT_ACCESS_ROLES.includes(form.role) && (
                  <Field>
                    <FieldLabel htmlFor="user-report-access">Vào trang báo cáo</FieldLabel>
                    <Select
                      value={form.reportAccess ? "yes" : "no"}
                      onValueChange={(value) => setForm({ ...form, reportAccess: value === "yes" })}
                    >
                      <SelectTrigger id="user-report-access" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="no">Không</SelectItem>
                          <SelectItem value="yes">Có – đăng nhập được trang báo cáo</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>Trang báo cáo theo hóa đơn điện tử, ở tên miền baocao.</FieldDescription>
                  </Field>
                )}
                {isChainManager && !noBranchRole(form.role) && (
                  <Field data-invalid={invalid.branch || undefined}>
                    <FieldLabel htmlFor="user-branch">Cơ sở</FieldLabel>
                    <Select value={form.branchId} onValueChange={(branchId) => setForm({ ...form, branchId })}>
                      <SelectTrigger id="user-branch" className="w-full" aria-invalid={invalid.branch || undefined}>
                        <SelectValue placeholder="Chọn cơ sở" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {invalid.branch && <FieldError>Vui lòng chọn cơ sở</FieldError>}
                  </Field>
                )}
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
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordFor} onOpenChange={(open) => !open && !saving && setPasswordFor(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={resetPassword} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Đặt mật khẩu – {passwordFor?.fullName}</DialogTitle>
              <DialogDescription>
                Tên đăng nhập: {passwordFor?.username}. Báo mật khẩu mới cho nhân viên và nhắc họ đổi sau khi đăng nhập.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={(passwordSubmitted && newPassword.length < 6) || undefined}>
              <FieldLabel htmlFor="reset-password">Mật khẩu mới</FieldLabel>
              <PasswordInput
                id="reset-password"
                placeholder="Ít nhất 6 ký tự"
                value={newPassword}
                invalid={passwordSubmitted && newPassword.length < 6}
                onChange={setNewPassword}
              />
              {passwordSubmitted && newPassword.length < 6 && <FieldError>Mật khẩu phải có ít nhất 6 ký tự</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordFor(null)} disabled={saving}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                Lưu mật khẩu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!locking}
        onOpenChange={(open) => !open && setLocking(null)}
        title={`Khóa tài khoản ${locking?.fullName ?? ""}?`}
        description="Tài khoản bị đăng xuất ngay và không đăng nhập được nữa. Lịch sử hóa đơn vẫn giữ nguyên; có thể mở khóa lại."
        confirmLabel="Khóa tài khoản"
        destructive
        onConfirm={async () => {
          if (locking) return setActive(locking, false);
        }}
      />
    </>
  );
}
