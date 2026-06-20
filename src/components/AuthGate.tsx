import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Cloud, LoaderCircle, LockKeyhole, LogOut, Mail } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button, Card } from "./ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const result = creatingAccount
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (creatingAccount && !result.data.session) setMessage("Check your email to confirm the account, then sign in.");
    setSubmitting(false);
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-xl p-6 sm:p-8">
          <Cloud className="h-8 w-8 text-yellow-300" />
          <h1 className="mt-5 text-2xl font-semibold text-zinc-50">Connect cloud storage</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment, then restart the app.
          </p>
        </Card>
      </main>
    );
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-zinc-950"><LoaderCircle className="h-7 w-7 animate-spin text-yellow-300" /></div>;
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md p-6 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-300 text-zinc-950"><LockKeyhole className="h-5 w-5" /></div>
          <h1 className="mt-5 text-2xl font-semibold text-zinc-50">{creatingAccount ? "Create admin account" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-zinc-300">Customer data is protected by your Supabase account.</p>
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
            <Button className="w-full border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" disabled={submitting} type="submit">
              {submitting ? "Please wait..." : creatingAccount ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button className="mt-4 w-full text-sm font-semibold text-yellow-200 hover:text-yellow-100" onClick={() => { setCreatingAccount((value) => !value); setMessage(""); }} type="button">
            {creatingAccount ? "Already have an account? Sign in" : "First time here? Create an account"}
          </button>
        </Card>
      </main>
    );
  }

  return (
    <>
      {children}
      <button className="fixed bottom-4 right-4 z-40 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-zinc-300 shadow-xl hover:border-yellow-300/60 hover:text-yellow-200" onClick={() => void supabase.auth.signOut()} title="Sign out" type="button">
        <LogOut className="h-4 w-4" />
      </button>
    </>
  );
}
