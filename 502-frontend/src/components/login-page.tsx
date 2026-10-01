"use client";

import { useState } from "react";
import { AlertCircleIcon, EyeIcon, EyeOffIcon, LogInIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/components/auth-provider";
import { APP_NAME, BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiErrorMessage } from "@/lib/api";

const YEAR = new Date().getFullYear();

// The login screen of both sites; the report site only changes its words.
export function LoginPage({
  eyebrow = "Hệ thống quản lý",
  tagline = "Bán hàng, kho, sổ quỹ và thống kê cho từng cơ sở trong một nơi.",
  heading = "Đăng nhập hệ thống",
}: {
  eyebrow?: string;
  tagline?: string;
  heading?: string;
}) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      setError(apiErrorMessage(err, "Tên đăng nhập hoặc mật khẩu không đúng"));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      {/* Phones: brand and theme switch on top, footer at the bottom. */}
      <header className="flex items-center justify-between p-6 md:hidden">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm animate-in duration-500 fade-in-0 zoom-in-95 md:max-w-4xl">
          <Card className="overflow-hidden p-0 shadow-lg">
            <CardContent className="grid p-0 md:grid-cols-2">
              {/* Brand panel: always dark, like the sidebar of a POS. */}
              <div className="dark hidden flex-col justify-between gap-10 bg-background p-10 text-foreground md:flex">
                <div className="flex items-center gap-3">
                  <BrandMark className="size-10 bg-secondary text-secondary-foreground" />
                  <span className="font-medium">{APP_NAME}</span>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
                  <h2 className="text-3xl leading-tight font-bold text-balance">Chuỗi karaoke 502</h2>
                  <p className="text-muted-foreground text-pretty">{tagline}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  © {YEAR} {APP_NAME}
                </p>
              </div>

              <div className="relative flex flex-col justify-center p-6 md:min-h-[32rem] md:p-12">
                <ThemeToggle className="absolute top-4 right-4 hidden md:inline-flex" />
                <form onSubmit={handleLogin}>
                  <FieldGroup>
                    <div className="flex flex-col gap-1">
                      <h1 className="text-2xl font-bold">{heading}</h1>
                      <p className="text-balance text-muted-foreground">Đăng nhập vào tài khoản của bạn</p>
                    </div>
                    {error && (
                      <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1">
                        <AlertCircleIcon />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                    <Field data-invalid={!!error || undefined}>
                      <FieldLabel htmlFor="username">Tên đăng nhập</FieldLabel>
                      <Input
                        id="username"
                        placeholder="Nhập tên đăng nhập"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoFocus
                        required
                        aria-invalid={!!error || undefined}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </Field>
                    <Field data-invalid={!!error || undefined}>
                      <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Nhập mật khẩu"
                          autoComplete="current-password"
                          required
                          aria-invalid={!!error || undefined}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            size="icon-xs"
                            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                            onClick={() => setShowPassword((v) => !v)}
                          >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                    <Field>
                      <Button type="submit" size="lg" disabled={loading}>
                        {loading ? <Spinner data-icon="inline-start" /> : <LogInIcon data-icon="inline-start" />}
                        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="p-6 text-center text-sm text-muted-foreground md:hidden">
        © {YEAR} {APP_NAME}
      </footer>
    </div>
  );
}
