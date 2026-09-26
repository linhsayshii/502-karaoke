"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/layout/UserMenu";
import { useAuth } from "@/components/auth-provider";
import { can, type Permission } from "@/lib/permissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const modules: { name: string; path: string; permission?: Permission }[] = [
  { name: "Bán hàng", path: "/sales" },
  { name: "Kho", path: "/inventory", permission: "inventory" },
  { name: "Quỹ", path: "/funds", permission: "funds" },
  { name: "Quản trị", path: "/admin", permission: "users" },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, branches } = useAuth();

  // /cs1/sales/rooms -> ["", "cs1", "sales", "rooms"]
  const pathParts = pathname?.split("/") || [];
  const currentBranch = pathParts[1];
  const branchName =
    branches.find((b) => b.code === currentBranch)?.name ?? user?.branch?.name ?? "";

  // Keep the same module when switching branch; drop ids (/sales/rooms/12).
  const handleBranchChange = (value: string) => {
    const section = pathParts.slice(2, 4).join("/") || "sales/rooms";
    router.push(`/${value}/${section}`);
  };

  return (
    <div className="sticky top-0 z-50 border-b bg-slate-900 text-white">
      <div className="flex h-12 items-center px-4">
        <div className="mr-8 font-bold text-lg">502 Karaoke</div>

        <div className="mr-6">
          {can(user, "branch.switch") ? (
            <Select value={currentBranch} onValueChange={handleBranchChange}>
              <SelectTrigger className="w-[160px] h-8 bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Chọn cơ sở" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                    {!b.active && " (ngừng hoạt động)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium">
              {branchName}
            </span>
          )}
        </div>

        <nav className="flex items-center space-x-6 text-sm font-medium">
          {modules
            .filter((module) => !module.permission || can(user, module.permission))
            .map((module) => {
              const href = `/${currentBranch}${module.path}`;
              const isActive = pathname?.startsWith(href);

              return (
                <Link
                  key={module.path}
                  href={href}
                  className={cn(
                    "transition-colors hover:text-slate-200",
                    isActive
                      ? "text-white font-bold border-b-2 border-white pb-1"
                      : "text-slate-400",
                  )}
                >
                  {module.name}
                </Link>
              );
            })}
        </nav>
        <div className="ml-auto flex items-center space-x-4">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
