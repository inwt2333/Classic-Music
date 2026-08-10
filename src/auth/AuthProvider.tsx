import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "./supabase";

export type AppRole = "user" | "admin";

export type AccountProfile = {
  displayName: string;
  role: AppRole;
};

export type SignInRequest = {
  id: number;
  reason: string;
};

type SignUpResult = {
  requiresEmailConfirmation: boolean;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  authError: string;
  profileLoading: boolean;
  profileError: string;
  passwordRecovery: boolean;
  signInRequest: SignInRequest | null;
  session: Session | null;
  user: User | null;
  profile: AccountProfile | null;
  isAdmin: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<SignUpResult>;
  resendSignUpConfirmation: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestSignIn: (reason: string) => void;
  dismissSignInRequest: () => void;
  clearAuthError: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [authError, setAuthError] = useState(consumeAuthCallbackError);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [signInRequest, setSignInRequest] = useState<SignInRequest | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;
    getSupabase().then(async (client) => {
      if (!active || !client) return;
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setLoading(false);

      const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        if (nextSession) {
          setAuthError("");
          setSignInRequest(null);
        }
        setLoading(false);
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch((reason) => {
      if (!active) return;
      setAuthError(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      setProfileError("");
      return;
    }

    const client = await getSupabase();
    if (!client) return;
    setProfileLoading(true);
    setProfileError("");
    const [{ data: profileRow, error: profileLoadError }, { data: roleRow, error: roleLoadError }] = await Promise.all([
      client.from("profiles").select("display_name").eq("id", session.user.id).maybeSingle(),
      client.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle(),
    ]);

    const loadError = profileLoadError ?? roleLoadError;
    if (loadError) {
      setProfileError(
        loadError.code === "PGRST205" || loadError.code === "42P01"
          ? "账号数据表尚未初始化"
          : loadError.message,
      );
    }

    setProfile({
      displayName: profileRow?.display_name?.trim()
        || session.user.user_metadata?.display_name?.trim()
        || session.user.email?.split("@")[0]
        || "用户",
      role: roleRow?.role === "admin" ? "admin" : "user",
    });
    setProfileLoading(false);
  }, [session?.user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError("");
    const client = await getSupabase();
    if (!client) throw new Error("Supabase 尚未配置");
    const { error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (displayName: string, email: string, password: string) => {
    setAuthError("");
    const client = await getSupabase();
    if (!client) throw new Error("Supabase 尚未配置");
    const { data, error } = await client.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });
    if (error) throw error;
    return { requiresEmailConfirmation: !data.session };
  }, []);

  const resendSignUpConfirmation = useCallback(async (email: string) => {
    setAuthError("");
    const client = await getSupabase();
    if (!client) throw new Error("Supabase 尚未配置");
    const { error } = await client.auth.resend({
      type: "signup",
      email: normalizeEmail(email),
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    setAuthError("");
    const client = await getSupabase();
    if (!client) throw new Error("Supabase 尚未配置");
    const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: getAuthRedirectUrl(),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    setAuthError("");
    const client = await getSupabase();
    if (!client) throw new Error("Supabase 尚未配置");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    setPasswordRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    const client = await getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    setProfile(null);
    setAuthError("");
    setProfileError("");
    setPasswordRecovery(false);
  }, []);

  const requestSignIn = useCallback((reason: string) => {
    setSignInRequest({ id: Date.now(), reason });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: supabaseConfigured,
    loading,
    authError,
    profileLoading,
    profileError,
    passwordRecovery,
    signInRequest,
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === "admin",
    signInWithPassword,
    signUp,
    resendSignUpConfirmation,
    sendPasswordReset,
    updatePassword,
    signOut,
    requestSignIn,
    dismissSignInRequest: () => setSignInRequest(null),
    clearAuthError: () => setAuthError(""),
    refreshProfile: loadProfile,
  }), [
    authError,
    loadProfile,
    loading,
    passwordRecovery,
    profile,
    profileError,
    profileLoading,
    requestSignIn,
    resendSignUpConfirmation,
    sendPasswordReset,
    session,
    signInRequest,
    signInWithPassword,
    signOut,
    signUp,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

function getAuthRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

function consumeAuthCallbackError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const message = hash.get("error_description") || query.get("error_description") || hash.get("error") || query.get("error");
  if (!message) return "";

  ["error", "error_code", "error_description"].forEach((key) => query.delete(key));
  const nextQuery = query.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  return message;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
