"use client";

import { useState } from "react";
import { Spinner } from "../components/Spinner";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

export function LoginForm({
  next,
  sent: initialSent,
  error: initialError,
}: {
  next: string;
  sent: boolean;
  error?: string;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(initialSent);
  const [error, setError] = useState<string | undefined>(initialError);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(undefined);

    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        // Don't auto-create a user — only the pre-created admin should be
        // able to log in. Supabase rejects new emails, surfaces a clean error.
        shouldCreateUser: false,
      },
    });

    setPending(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-8 flex flex-col gap-3"
      style={{ fontFamily: "var(--font-roslindale-text)" }}
    >
      <label className="flex flex-col gap-2 text-[12px] uppercase tracking-wide text-neutral-700">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-[14px] text-[#040d08] outline-none transition focus:border-[#040d08]"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="mt-2 rounded-md bg-[#040d08] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {pending && <Spinner />}
          {pending ? "Sending" : "Send magic link"}
        </span>
      </button>

      {sent && (
        <p
          aria-live="polite"
          className="rounded-md bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800"
        >
          Check your inbox. The link signs you in and lands you on the
          dashboard.
        </p>
      )}

      {error && (
        <p
          aria-live="polite"
          className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      )}
    </form>
  );
}
