"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth-provider";
import { BranchSwitcher } from "@/components/layout/branch-switcher";
import { NavUser } from "@/components/layout/nav-user";
import { useBranchCode } from "@/lib/branch";
import { findNav, visibleNav } from "@/lib/navigation";

// Navigation of the whole app; only the pages the role may use are listed
// (the backend enforces access, this only hides).
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const subPath = pathname.replace(/^\/[^/]+/, "");
  const active = findNav(subPath, user);

  // Close the mobile sheet after navigating.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <BranchSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {visibleNav(user).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild isActive={active?.item.path === item.path} tooltip={item.title}>
                    <Link href={`/${branch}${item.path}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
