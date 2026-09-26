"use client";

import { usePathname, useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, StoreIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth-provider";
import { APP_NAME, BrandMark } from "@/components/brand";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";

// Sidebar header: the app and the branch on screen. The chain manager can
// switch branch and stays on the same page (ids dropped: /sales/rooms/12).
export function BranchSwitcher() {
  const { user, branches } = useAuth();
  const branch = useBranchCode();
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile } = useSidebar();
  const current = branches.find((b) => b.code === branch);
  const label = current?.name ?? user?.branch?.name ?? branch.toUpperCase();

  const header = (
    <>
      <BrandMark className="bg-sidebar-primary text-sidebar-primary-foreground" />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{APP_NAME}</span>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
    </>
  );

  if (!can(user, "branch.switch")) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {header}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const switchTo = (code: string) => {
    const [, , ...rest] = pathname.split("/");
    const section = rest.filter((segment) => !/^\d+$/.test(segment)).join("/") || "sales/rooms";
    router.push(`/${code}/${section}`);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {header}
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Cơ sở</DropdownMenuLabel>
              {branches.map((b) => (
                <DropdownMenuItem key={b.code} onClick={() => switchTo(b.code)} className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <StoreIcon className="size-3.5 shrink-0" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span>{b.name}</span>
                    {!b.active && <span className="text-xs text-muted-foreground">Ngừng hoạt động</span>}
                  </div>
                  {b.code === branch && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
