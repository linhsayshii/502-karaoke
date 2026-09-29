"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import api, { getSessionExpiresAt, onSessionChange, onSessionExpired, setSession } from "@/lib/api";
import { BrandMark } from "@/components/brand";
import { Spinner } from "@/components/ui/spinner";
import { can } from "@/lib/permissions";
import type { Branch, User } from "@/lib/types";

interface LoginData {
  username: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  // Branches the account may open (chain manager: all; others: their own).
  branches: Branch[];
  loading: boolean;
  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  reloadBranches: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Where an account lands after login: its branch's room map.
export function homePath(user: User, branches: Branch[]) {
  const code =
    user.branch?.code ?? branches.find((b) => b.active)?.code ?? branches[0]?.code ?? "cs1";
  return `/${code}/sales/rooms`;
}

export function canOpenBranch(user: User, branches: Branch[], code: string) {
  return can(user, "branch.switch")
    ? branches.some((b) => b.code === code)
    : user.branch?.code === code;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  // End of the login session (ms), kept in step with lib/api.
  const [sessionExpiresAt, setSessionExpiresAt] = useState(getSessionExpiresAt);
  const userRef = useRef<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => onSessionChange(setSessionExpiresAt), []);

  const fetchBranches = async () => {
    const res = await api.get<Branch[]>("/branches");
    setBranches(res.data);
    return res.data;
  };

  const checkAuth = async () => {
    try {
      // If no token in memory, the interceptor tries /auth/refresh first.
      const response = await api.get<User>("/auth/me");
      await fetchBranches();
      setUser(response.data);
    } catch {
      setUser(null);
      setBranches([]);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;

    const isLoginPage = pathname === "/";
    if (!user) {
      if (!isLoginPage) router.replace("/");
      return;
    }
    if (isLoginPage) {
      router.replace(homePath(user, branches));
      return;
    }

    // Accounts are tied to one branch: move them back if the URL says otherwise.
    const [, code, ...rest] = pathname.split("/");
    if (!canOpenBranch(user, branches, code)) {
      router.replace(
        user.branch ? `/${user.branch.code}/${rest.join("/")}` : homePath(user, branches),
      );
    }
  }, [user, branches, loading, pathname, router]);

  const login = async (data: LoginData) => {
    const response = await api.post("/auth/login", data);
    setSession(response.data.access_token, response.data.sessionExpiresAt);
    const loggedIn = response.data.user as User;
    const list = await fetchBranches();
    setUser(loggedIn);
    router.push(homePath(loggedIn, list));
    toast.success(`Xin chào ${loggedIn.fullName}!`);
  };

  // Ends the session here and on the server (clears the refresh cookie).
  const signOut = useCallback(
    async (reason?: string) => {
      userRef.current = null;
      try {
        await api.post("/auth/logout");
      } catch (error) {
        console.error("Logout failed", error);
      }
      setSession(null);
      setUser(null);
      setBranches([]);
      router.push("/");
      if (reason) toast.error(reason);
      else toast("Đã đăng xuất. Hẹn gặp lại!");
    },
    [router],
  );

  const logout = useCallback(() => signOut(), [signOut]);

  // The server ends every login after 24 hours: sign out right then.
  useEffect(() => {
    if (!user || !sessionExpiresAt) return;
    const timeoutId = setTimeout(
      () => signOut("Phiên đăng nhập đã hết 24 giờ. Vui lòng đăng nhập lại."),
      Math.max(0, sessionExpiresAt - Date.now()),
    );
    return () => clearTimeout(timeoutId);
  }, [user, sessionExpiresAt, signOut]);

  // A request found the session over (expired, password changed, account locked).
  useEffect(
    () =>
      onSessionExpired(() => {
        if (!userRef.current) return;
        userRef.current = null;
        setUser(null);
        setBranches([]);
        toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }),
    [],
  );

  // Auto logout after 15 hours without activity.
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT = 15 * 60 * 60 * 1000; // 15 hours
    let timeoutId: NodeJS.Timeout;

    const handleLogout = () => {
      signOut("Bạn đã bị đăng xuất do không hoạt động trong 15 giờ.");
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleLogout, INACTIVITY_LIMIT);
    };

    resetTimer();

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    let lastReset = Date.now();

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReset > 1000) {
        resetTimer();
        lastReset = now;
      }
    };

    events.forEach((event) => window.addEventListener(event, handleActivity));

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [user, signOut]);

  const reloadBranches = async () => {
    await fetchBranches();
  };

  return (
    <AuthContext.Provider value={{ user, branches, loading, login, logout, checkAuth, reloadBranches }}>
      {loading ? <SessionLoading /> : children}
    </AuthContext.Provider>
  );
}

// Shown while the session is restored on page load.
function SessionLoading() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background">
      <BrandMark className="size-10 animate-in fade-in-0 zoom-in-95 duration-500" />
      <Spinner className="text-muted-foreground" />
    </div>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
