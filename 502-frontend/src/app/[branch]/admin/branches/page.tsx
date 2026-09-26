"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Power } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import type { Branch } from "@/lib/types";

interface BranchForm {
  code: string;
  name: string;
  address: string;
}

// Chain manager only (route guard + backend @Roles).
export default function BranchesPage() {
  const { branches, reloadBranches } = useAuth();
  const notify = useNotify();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [form, setForm] = useState<BranchForm>({ code: "", name: "", address: "" });

  const openForm = (branch: Branch | "new") => {
    setEditing(branch);
    setForm(
      branch === "new"
        ? { code: "", name: "", address: "" }
        : { code: branch.code, name: branch.name, address: branch.address ?? "" },
    );
  };

  const save = async () => {
    if (!form.name.trim()) {
      notify.error(null, "Vui lòng nhập tên cơ sở");
      return;
    }
    try {
      if (editing === "new") {
        await api.post("/branches", {
          code: form.code.trim().toLowerCase(),
          name: form.name.trim(),
          address: form.address.trim() || undefined,
        });
        notify.success("Đã thêm cơ sở");
      } else if (editing) {
        await api.patch(`/branches/${editing.id}`, {
          name: form.name.trim(),
          address: form.address.trim(),
        });
        notify.success("Đã cập nhật cơ sở");
      }
      setEditing(null);
      await reloadBranches();
    } catch (error) {
      notify.error(error, "Không thể lưu cơ sở");
    }
  };

  const toggleActive = async (branch: Branch) => {
    if (
      branch.active &&
      !window.confirm(`Ngừng hoạt động ${branch.name}? Cơ sở vẫn giữ nguyên dữ liệu.`)
    ) {
      return;
    }
    try {
      await api.patch(`/branches/${branch.id}`, { active: !branch.active });
      await reloadBranches();
    } catch (error) {
      notify.error(error, "Không thể cập nhật cơ sở");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Cơ sở</CardTitle>
          <CardDescription>Các cơ sở trong chuỗi. Mã cơ sở dùng trên đường dẫn và không đổi được.</CardDescription>
        </div>
        <Button size="sm" onClick={() => openForm("new")}>
          <Plus className="mr-2 h-4 w-4" /> Thêm cơ sở
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Tên cơ sở</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-[100px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((b) => (
              <TableRow key={b.id} className={b.active ? "" : "opacity-60"}>
                <TableCell className="font-mono">{b.code}</TableCell>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.address ?? ""}</TableCell>
                <TableCell>
                  {b.active ? (
                    <Badge variant="secondary">Đang hoạt động</Badge>
                  ) : (
                    <Badge variant="outline">Ngừng hoạt động</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openForm(b)} title="Sửa">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleActive(b)}
                    title={b.active ? "Ngừng hoạt động" : "Hoạt động lại"}
                    className={b.active ? "text-red-500" : "text-green-600"}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Thêm cơ sở" : "Sửa cơ sở"}</DialogTitle>
            <DialogDescription>
              Cơ sở mới chưa có phòng, mặt hàng và nhân viên; thêm trong Cài đặt và Quản trị sau khi tạo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Mã</Label>
              <Input
                className="col-span-3"
                placeholder="vd: cs5"
                value={form.code}
                disabled={editing !== "new"}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Tên cơ sở</Label>
              <Input
                className="col-span-3"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Địa chỉ</Label>
              <Input
                className="col-span-3"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
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
