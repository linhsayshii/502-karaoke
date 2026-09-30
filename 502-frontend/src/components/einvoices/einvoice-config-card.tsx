"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";
import type { EinvoiceConfigView, InvoiceSymbol } from "@/lib/types";

// The Minvoice account of the branch (spec §10.1): the chain manager logs in,
// then picks the symbol from the dropdown beside it; only the company name of
// the seller is shown. Everyone else sees one status line. AppShell remounts the
// page on every path change, so switching branch starts the card from scratch.
export function EinvoiceConfigCard({
  config,
  loading,
  onChanged,
}: {
  config: EinvoiceConfigView | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const notify = useNotify();
  const editable = can(user, "einvoices.config");
  const [loggingIn, setLoggingIn] = useState(false);
  const [symbols, setSymbols] = useState<InvoiceSymbol[] | null>(null);
  const [savingSymbol, setSavingSymbol] = useState(false);

  const loadSymbols = useCallback(() => {
    api
      .get<{ symbols: InvoiceSymbol[] }>("/einvoice/config/symbols", { params: { branch } })
      .then((res) => setSymbols(res.data.symbols))
      .catch((error) => notify.error(error, "Không tải được danh sách ký hiệu"));
  }, [branch, notify]);

  const canLoadSymbols = editable && !!config && !config.needsLogin;
  useEffect(() => {
    if (canLoadSymbols) loadSymbols();
  }, [canLoadSymbols, loadSymbols]);

  const login = async (username: string, password: string) => {
    setLoggingIn(true);
    try {
      await api.post("/einvoice/config/login", { username, password }, { params: { branch } });
      notify.success("Đã đăng nhập Minvoice");
      onChanged();
      // Not logged in before: the effect above loads them once the reloaded
      // config says so. Already logged in: nothing changes there, so load now.
      if (canLoadSymbols) loadSymbols();
      return true;
    } catch (error) {
      notify.error(error, "Không đăng nhập được Minvoice");
      return false;
    } finally {
      setLoggingIn(false);
    }
  };

  const selectSymbol = async (registerInvoiceId: string) => {
    setSavingSymbol(true);
    try {
      await api.put("/einvoice/config/symbol", { registerInvoiceId }, { params: { branch } });
      notify.success("Đã chọn ký hiệu hóa đơn");
      onChanged();
    } catch (error) {
      notify.error(error, "Không chọn được ký hiệu");
    } finally {
      setSavingSymbol(false);
    }
  };

  if (loading && !config) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (!config) return null;

  if (!config.branchTaxCode) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>Cơ sở chưa có mã số thuế</AlertTitle>
        <AlertDescription>
          {can(user, "branches") ? (
            <span>
              Nhập MST ở trang{" "}
              <Link className="underline" href={`/${branch}/admin/branches`}>
                Cơ sở
              </Link>{" "}
              trước khi đăng nhập Minvoice.
            </span>
          ) : (
            "Quản lý hệ thống cần nhập MST của cơ sở trước."
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!editable) {
    return (
      <Card className="py-3">
        <CardContent className="flex items-center gap-2 px-4 text-sm">
          {config.configured ? (
            <CircleCheckIcon className="size-4 shrink-0 text-success" />
          ) : (
            <TriangleAlertIcon className="size-4 shrink-0 text-warning" />
          )}
          <span className="min-w-0 truncate">
            {config.configured
              ? `Minvoice: ${config.username} · ${config.symbolCode} · ${config.sellerName}`
              : "Chưa cấu hình Minvoice. Quản lý hệ thống cần đăng nhập và chọn ký hiệu."}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <LoginForm
            key={config.username ?? ""}
            taxCode={config.branchTaxCode}
            initialUsername={config.username ?? ""}
            busy={loggingIn}
            onLogin={login}
          />
          <Select
            value={config.registerInvoiceId ?? undefined}
            onValueChange={selectSymbol}
            disabled={!symbols || savingSymbol || config.needsLogin}
          >
            <SelectTrigger className="w-full @lg/main:w-56" aria-label="Ký hiệu hóa đơn">
              {/* The saved symbol by its code: the list may not have loaded yet. */}
              <SelectValue placeholder={symbols ? "Chọn ký hiệu" : "Đăng nhập để chọn ký hiệu"}>
                {config.registerInvoiceId ? config.symbolCode : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(symbols ?? []).map((symbol) => (
                  <SelectItem key={symbol.registerInvoiceId} value={symbol.registerInvoiceId}>
                    {symbol.symbolCode}
                    {symbol.invoiceTypeName ? ` — ${symbol.invoiceTypeName}` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {config.configured && <CircleCheckIcon className="size-4 text-success" aria-label="Đã cấu hình" />}
        </div>
        {config.needsLogin && config.username && (
          <p className="text-sm text-warning">
            {config.loginError ?? "Cần đăng nhập Minvoice lại (MST của cơ sở đã đổi hoặc mật khẩu đã lưu không đọc được)."}
          </p>
        )}
        {config.sellerName && <p className="text-sm font-medium">{config.sellerName}</p>}
      </CardContent>
    </Card>
  );
}

// Username + password + Đăng nhập. Keyed by the saved username, so the box
// starts from it without an effect; the password is never filled in, is only
// held in this state while typing and is cleared after a successful login.
function LoginForm({
  taxCode,
  initialUsername,
  busy,
  onLogin,
}: {
  taxCode: string;
  initialUsername: string;
  busy: boolean;
  onLogin: (username: string, password: string) => Promise<boolean>;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    if (await onLogin(username.trim(), password)) setPassword("");
  };
  return (
    <form onSubmit={submit} className="contents">
      <span className="text-sm text-muted-foreground">MST {taxCode}</span>
      <Input
        aria-label="Tên đăng nhập Minvoice"
        placeholder="Tên đăng nhập"
        autoComplete="off"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full @lg/main:w-40"
      />
      <Input
        aria-label="Mật khẩu Minvoice"
        type="password"
        placeholder="Mật khẩu"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full @lg/main:w-40"
      />
      <Button type="submit" disabled={busy || !username.trim() || !password}>
        {busy && <Spinner data-icon="inline-start" />}
        Đăng nhập
      </Button>
    </form>
  );
}
