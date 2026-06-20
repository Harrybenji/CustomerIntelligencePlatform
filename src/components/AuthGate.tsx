import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Clock3, Cloud, LoaderCircle, LockKeyhole, LogOut, Mail, RefreshCw, ShieldCheck, UserX } from "lucide-react";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button, Card } from "./ui";
import { UserAccessPanel } from "./UserAccessPanel";

type AccessProfile = {
  id: string;
  email: string;
  display_name: string | null;
  role: "user" | "super_admin";
  status: "pending" | "approved" | "rejected";
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [accessLoading, setAccessLoading] = useState(false);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [accessError, setAccessError] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  const loadAccessProfile = useCallback(async () => {
    if (!session?.user.id) {
      setProfile(null);
      return;
    }
    setAccessLoading(true);
    setAccessError("");
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id,email,display_name,role,status")
      .eq("id", session.user.id)
      .single();
    if (error) {
      setProfile(null);
      setAccessError(error.message);
    } else {
      setProfile(data as AccessProfile);
    }
    setAccessLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    const initializeAuth = async () => {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const requestedType = url.searchParams.get("type");
      const otpTypes: EmailOtpType[] = ["email", "signup", "invite", "magiclink", "recovery", "email_change"];

      if (tokenHash && requestedType && otpTypes.includes(requestedType as EmailOtpType)) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: requestedType as EmailOtpType });
        if (active) setMessage(error ? error.message : "Email confirmed. Your access request is ready for review.");
        if (!error) window.history.replaceState({}, document.title, `${url.pathname}${url.hash}`);
      }

      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const callbackError = hashParams.get("error_description") ?? url.searchParams.get("error_description");
      if (active && callbackError) setMessage(callbackError.replace(/\+/g, " "));

      const { data: sessionData } = await supabase.auth.getSession();
      if (active) {
        setSession(sessionData.session);
        setLoading(false);
      }
    };

    void initializeAuth();
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadAccessProfile();
  }, [loadAccessProfile]);

  useEffect(() => {
    if (profile?.status !== "pending") return;
    const interval = window.setInterval(() => void loadAccessProfile(), 15000);
    return () => window.clearInterval(interval);
  }, [loadAccessProfile, profile?.status]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const result = creatingAccount
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (creatingAccount && !result.data.session) setMessage("Check your email to confirm the account. Your access request will then await approval.");
    setSubmitting(false);
  };

  const signOut = () => void supabase.auth.signOut();

  if (!isSupabaseConfigured) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-xl p-6 sm:p-8">
          <Cloud className="h-8 w-8 text-yellow-300" />
          <h1 className="mt-5 text-2xl font-semibold text-zinc-50">Connect cloud storage</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment, then restart the app.</p>
        </Card>
      </main>
    );
  }

  if (loading || (session && accessLoading && !profile)) {
    return <div className="grid min-h-screen place-items-center bg-zinc-950"><LoaderCircle className="h-7 w-7 animate-spin text-yellow-300" /></div>;
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md p-6 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950"><LockKeyhole className="h-5 w-5" /></div>
          <h1 className="mt-5 text-2xl font-semibold text-zinc-50">{creatingAccount ? "Request access" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-zinc-300">{creatingAccount ? "Create an account for super-admin review." : "Use your approved Customer Intelligence account."}</p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-200">Email</span>
              <span className="flex h-12 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 focus-within:border-yellow-300">
                <Mail className="h-4 w-4 text-zinc-500" />
                <input className="min-w-0 flex-1 bg-transparent text-zinc-50 outline-none" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </span>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-200">Password</span>
              <span className="flex h-12 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 focus-within:border-yellow-300">
                <LockKeyhole className="h-4 w-4 text-zinc-500" />
                <input className="min-w-0 flex-1 bg-transparent text-zinc-50 outline-none" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </span>
            </label>
            {message ? <p className="rounded-lg border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm text-yellow-100">{message}</p> : null}
            <Button className="w-full border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" disabled={submitting} type="submit">{submitting ? "Please wait..." : creatingAccount ? "Submit access request" : "Sign in"}</Button>
          </form>
          <button className="mt-4 w-full text-sm font-semibold text-yellow-200 hover:text-yellow-100" onClick={() => { setCreatingAccount((value) => !value); setMessage(""); }} type="button">{creatingAccount ? "Already approved? Sign in" : "Need access? Create an account"}</button>
        </Card>
      </main>
    );
  }

  if (accessError) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-lg p-6 text-center sm:p-8">
          <UserX className="mx-auto h-8 w-8 text-red-300" />
          <h1 className="mt-4 text-xl font-semibold text-zinc-50">Access check unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{accessError}</p>
          <div className="mt-5 flex justify-center gap-2"><Button onClick={() => void loadAccessProfile()}><RefreshCw className="h-4 w-4" /> Retry</Button><Button onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button></div>
        </Card>
      </main>
    );
  }

  if (profile?.status === "pending") {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-lg p-6 text-center sm:p-8">
          <Clock3 className="mx-auto h-9 w-9 text-yellow-300" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-50">Approval pending</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">Your account request for {profile.email} is waiting for a super admin. This page checks automatically.</p>
          <div className="mt-5 flex justify-center gap-2"><Button onClick={() => void loadAccessProfile()}><RefreshCw className="h-4 w-4" /> Check status</Button><Button onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button></div>
        </Card>
      </main>
    );
  }

  if (profile?.status === "rejected") {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-lg p-6 text-center sm:p-8">
          <UserX className="mx-auto h-9 w-9 text-red-300" />
          <h1 className="mt-4 text-2xl font-semibold text-zinc-50">Access not approved</h1>
          <p className="mt-2 text-sm text-zinc-300">Contact the platform super admin if you believe this should be reviewed.</p>
          <Button className="mt-5" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
        </Card>
      </main>
    );
  }

  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-40 flex gap-2">
        {profile?.role === "super_admin" ? <button className="relative rounded-lg border border-yellow-300/40 bg-zinc-950 p-3 text-yellow-200 shadow-xl hover:border-yellow-300" onClick={() => setAdminPanelOpen(true)} title="User access admin" type="button"><ShieldCheck className="h-4 w-4" /></button> : null}
        <button className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-zinc-300 shadow-xl hover:border-yellow-300/60 hover:text-yellow-200" onClick={signOut} title="Sign out" type="button"><LogOut className="h-4 w-4" /></button>
      </div>
      {adminPanelOpen ? <UserAccessPanel onClose={() => setAdminPanelOpen(false)} /> : null}
    </>
  );
}
