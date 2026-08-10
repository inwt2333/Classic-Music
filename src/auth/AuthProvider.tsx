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

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  profileLoading: boolean;
  profileError: string;
  session: Session | null;
  user: User | null;
  profile: AccountProfile | null;
  isAdmin: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

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
      if (error) setProfileError(error.message);
      setSession(data.session);
      setLoading(false);

      const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch((reason) => {
      if (!active) return;
      setProfileError(reason instanceof Error ? reason.message : String(reason));
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

  const signInWithEmail = useCallback(async (email: string) => {
    const client = await getSupabase();
    if (!client) throw new Error("Supabase 尚未配置");
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
    const { error } = await client.auth.signInWithOtp({
      email: email.trim().toLocaleLowerCase("en-US"),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const client = await getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setProfile(null);
    setProfileError("");
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: supabaseConfigured,
    loading,
    profileLoading,
    profileError,
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === "admin",
    signInWithEmail,
    signOut,
    refreshProfile: loadProfile,
  }), [loadProfile, loading, profile, profileError, profileLoading, session, signInWithEmail, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
