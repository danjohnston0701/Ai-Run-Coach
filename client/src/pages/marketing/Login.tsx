import { useState } from "react";
import { Link, Redirect, useSearch } from "wouter";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/queryClient";
import { APP_STORE_URL, Logo, PLAY_STORE_URL } from "@/components/brand/Logo";

function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/dashboard";
  return raw;
}

export default function Login() {
  const { session, signIn, acceptSession } = useAuth();
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const search = useSearch();
  const next = safeNext(new URLSearchParams(search).get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Redirect to={next} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.body?.requiresVerification) {
        setVerifyFor(err.body?.email || email.trim());
      } else if (err instanceof ApiError && err.status === 403) {
        setError(err.body?.message || err.body?.error || "This account can’t sign in yet.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("That email and password don’t match an account.");
      } else {
        setError(err instanceof Error ? err.message : "Couldn’t sign in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ user: any; token: string }>("POST", "/api/auth/verify-email", { email: verifyFor, otp: code.trim() });
      acceptSession(data.user, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn’t work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen bg-root lg:grid-cols-2">
      {/* Brand side */}
      <div className="relative hidden overflow-hidden border-r border-line/60 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(0,212,255,0.18),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(0,230,118,0.12),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-end gap-8">
            <img src="/marketing/ios-summary.jpg" alt="Run summary in the Ai Run Coach app" className="w-56 rounded-[28px] border border-white/10 shadow-2xl shadow-black/60" />
            <div className="max-w-xs pb-6">
              <p className="text-3xl font-bold leading-tight tracking-tight text-ink">
                Every run, <span className="text-gradient">understood.</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                Review your runs, plans and progress on the big screen. Your coach and your data, in sync with the app.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm text-ink-2">Sign in with your Ai Run Coach account.</p>

          {verifyFor ? (
            <form onSubmit={verify} className="mt-8 space-y-4">
              <div className="rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-3 text-sm text-ink-2">
                Your email isn’t verified yet. We’ve sent a 6-digit code to <span className="font-semibold text-ink">{verifyFor}</span>.
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-ink-2">Verification code</span>
                <Input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="num text-lg tracking-[0.3em]" />
              </label>
              {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</div>}
              <Button type="submit" size="lg" className="w-full" disabled={busy || code.trim().length < 4}>
                {busy && <Loader2 className="animate-spin" />} Verify and sign in
              </Button>
              <button type="button" onClick={() => { setVerifyFor(null); setError(null); }} className="w-full text-center text-sm text-ink-3 hover:text-ink">
                Back to sign in
              </button>
            </form>
          ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink-2">Email</span>
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-2">
                Password
                <Link href="/forgot-password" className="text-brand hover:underline">
                  Forgot password?
                </Link>
              </span>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-3 hover:text-ink"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</div>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Sign in
            </Button>
          </form>
          )}

          <div className="mt-10 rounded-2xl border border-line bg-surface p-5">
            <div className="text-sm font-semibold text-ink">New to Ai Run Coach?</div>
            <p className="mt-1 text-sm text-ink-2">Create your account in the app — your coach sets up around your goals in a couple of minutes.</p>
            <div className="mt-4 flex gap-2">
              <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-line-strong/70 px-3 py-2 text-center text-xs font-semibold text-ink hover:bg-surface-2">
                App Store
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border border-line-strong/70 px-3 py-2 text-center text-xs font-semibold text-ink hover:bg-surface-2">
                Google Play
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
