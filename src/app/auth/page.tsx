"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "login" | "register";

// Where to land after auth: the landing page sends ?next=/ so its "Get started"
// flows into the feed; every other entry keeps the /profile default. Internal
// paths only (reject protocol-relative //host). Read from window (client-only
// call sites) to avoid the useSearchParams Suspense requirement.
function nextTarget(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/profile";
}

function GoogleLogo() {
  // Brand asset (Google "G") — exception to the no-hand-rolled-SVG rule, since
  // the OAuth button needs the official mark and there's no icon-lib version.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const { user, loading, error, registerWithEmail, loginWithEmail, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → leave the auth screen.
  useEffect(() => {
    if (!loading && user) router.replace(nextTarget());
  }, [loading, user, router]);

  function validate(): string | null {
    if (!email.trim()) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    if (!password) return "Enter your password.";
    if (mode === "register") {
      if (!name.trim()) return "Enter your name.";
      if (password.length < 6) return "Password should be at least 6 characters.";
      if (password !== confirm) return "Passwords don't match.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setFormError(v);
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      if (mode === "register") await registerWithEmail(name.trim(), email.trim(), password);
      else await loginWithEmail(email.trim(), password);
      router.replace(nextTarget());
    } catch {
      // error surfaced via context `error`
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      router.replace(nextTarget());
    } catch {
      setSubmitting(false);
    }
  }

  const shownError = formError ?? error;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-10">
      <Link
        href="/"
        aria-label="Back"
        className="mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-card transition active:scale-95"
      >
        <ArrowLeft size={18} />
      </Link>

      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary-dark">
            {mode === "login" ? "Welcome back" : "Join FixIt"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Sign in to track your reports and earn civic points."
              : "Create an account to track reports and earn civic points."}
          </p>

          {/* toggle */}
          <div className="mt-5 flex gap-1 rounded-full bg-surface p-1 shadow-card">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setFormError(null);
                }}
                className={`flex-1 rounded-full py-2 text-sm font-semibold transition active:scale-[0.98] ${
                  mode === m ? "bg-primary text-white" : "text-muted"
                }`}
              >
                {m === "login" ? "Log in" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {mode === "register" && (
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Kumar"
                  autoComplete="name"
                  className={inputClass}
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClass}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={inputClass}
              />
            </Field>
            {mode === "register" && (
              <Field label="Confirm password">
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={inputClass}
                />
              </Field>
            )}

            {shownError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={15} className="shrink-0" />
                {shownError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-display font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {submitting && <Loader2 size={18} className="animate-spin" />}
              {mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          {/* divider */}
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-muted">or</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            onClick={handleGoogle}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-surface py-3 text-sm font-semibold text-foreground shadow-card transition active:scale-[0.98] disabled:opacity-60"
          >
            <GoogleLogo />
            Continue with Google
          </button>
        </motion.div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
