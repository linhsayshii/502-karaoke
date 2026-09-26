"use client";

import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { LogOut, Lock } from "lucide-react";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { ROLE_LABELS } from "@/lib/permissions";

export function UserMenu() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isChangePassDialogOpen, setIsChangePassDialogOpen] = useState(false);
  
  // Change password form state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Always render something to avoid layout shift, but only show content if user exists
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    await logout();
    setIsLogoutDialogOpen(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Mật khẩu mới không khớp nhau",
      });
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        oldPassword,
        newPassword,
      });
      toast({
        title: "Thành công",
        description: "Đổi mật khẩu thành công",
      });
      setIsChangePassDialogOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: apiErrorMessage(error, "Không thể đổi mật khẩu"),
      });
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return <div className="w-10 h-10" />;
  if (!user) return null;

  return (
    <>
      <div className="flex items-center space-x-4">
        <div className="flex items-center bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 shadow-sm">
          <div className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="text-[11px] font-bold text-white tracking-wider">ONLINE</span>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-11 flex items-center space-x-3 hover:bg-slate-800 px-3 rounded-xl border border-transparent hover:border-slate-700 transition-all duration-200 focus-visible:ring-0 focus-visible:ring-offset-0">
              <div className="flex flex-col items-end mr-1">
                <span className="text-sm font-bold text-white leading-tight">
                  {user.fullName}
                </span>
                <span className="text-xs text-slate-400 leading-tight font-medium">{ROLE_LABELS[user.role]}</span>
              </div>
              <Avatar className="h-9 w-9 border-2 border-indigo-500/30 shadow-sm">
                <AvatarFallback className="bg-indigo-600 text-white font-bold text-sm">
                  {user.fullName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 mt-2" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.fullName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.username} · {ROLE_LABELS[user.role]}
                  {user.branch && ` · ${user.branch.name}`}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsChangePassDialogOpen(true)} className="cursor-pointer">
              <Lock className="mr-2 h-4 w-4" />
              <span>Đổi mật khẩu</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-red-600 focus:text-red-600 cursor-pointer focus:bg-red-50" 
              onClick={() => setIsLogoutDialogOpen(true)}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Logout Confirmation Dialog */}
      <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đăng xuất</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogoutDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleLogout}>Đăng xuất</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isChangePassDialogOpen} onOpenChange={setIsChangePassDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Đổi mật khẩu</DialogTitle>
            <DialogDescription>
              Nhập mật khẩu cũ và mật khẩu mới để thay đổi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="old-pass">Mật khẩu cũ</Label>
                <Input
                  id="old-pass"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-pass">Mật khẩu mới</Label>
                <Input
                  id="new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-pass">Xác nhận mật khẩu mới</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsChangePassDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Đang xử lý..." : "Cập nhật"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
