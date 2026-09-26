"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { useAuth } from "@/components/auth-provider";
import { can, type Permission } from "@/lib/permissions";
import { useBranchCode } from "@/lib/branch";

export interface SubNavItem {
  label: string;
  path: string; // under /[branch]
  permission?: Permission;
}

// Second-level menu of a module; hides entries the account cannot use.
export function SubNavBar({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();
  const branch = useBranchCode();
  const { user } = useAuth();

  return (
    <div className="sticky top-12 z-40 border-b bg-white px-4 py-2 shadow-sm">
      <NavigationMenu>
        <NavigationMenuList>
          {items
            .filter((item) => !item.permission || can(user, item.permission))
            .map((item) => {
              const href = `/${branch}${item.path}`;
              return (
                <NavigationMenuItem key={item.path}>
                  <NavigationMenuLink
                    asChild
                    active={pathname?.startsWith(href)}
                    className={navigationMenuTriggerStyle()}
                  >
                    <Link href={href}>{item.label}</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}
