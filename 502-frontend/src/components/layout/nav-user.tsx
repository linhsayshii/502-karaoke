"use client";

import { useState } from "react";
import {
  ChevronsUpDownIcon,
  KeyRoundIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  SunMoonIcon,
  Trash2Icon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth-provider";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { initials } from "@/lib/format";
import { PurgeDataDialog } from "@/components/purge-data-dialog";
import { can } from "@/lib/permissions";


export function NavUser() {
  const { user, logout } = useAuth();
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  if (!user) return null;

  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg">{initials(user.fullName)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.fullName}</span>
        <span className="truncate text-xs text-muted-foreground">{user.username}</span>
      </div>
    </>
  );

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                {identity}
                <ChevronsUpDownIcon className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{identity}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
                  <KeyRoundIcon />
                  Đổi mật khẩu
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <SunMoonIcon />
                    Giao diện
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                      <DropdownMenuRadioItem value="light">
                        <SunIcon />
                        Sáng
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <MoonIcon />
                        Tối
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        <MonitorIcon />
                        Theo hệ thống
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {can(user, "purge") && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setPurgeOpen(true)}>
                    <Trash2Icon />
                    Xóa dữ liệu
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => setLogoutOpen(true)}>
                  <LogOutIcon />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      {can(user, "purge") && <PurgeDataDialog open={purgeOpen} onOpenChange={setPurgeOpen} />}
      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Đăng xuất?"
        description="Bạn sẽ cần đăng nhập lại để tiếp tục làm việc."
        confirmLabel="Đăng xuất"
        destructive
        onConfirm={logout}
      />
    </>
  );
}
