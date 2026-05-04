"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../components/Spinner";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

export function LoginForm({
  next,
  error: initialError,
}: {
  next: string;
  error?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setPending(true);
    setError(undefined);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setPending(false);
      setError(error.message);
      return;
    }

    // Cookies are set on the browser by the SSR client; refresh so the proxy
    // sees them, then push to `next`.
    router.refresh();
    router.push(next);
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
          id="email"
          name="email"
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

      <label className="flex flex-col gap-2 text-[12px] uppercase tracking-wide text-neutral-700">
        Password
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-[14px] text-[#040d08] outline-none transition focus:border-[#040d08]"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !email.trim() || !password}
        className="mt-2 rounded-md bg-[#040d08] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:opacity-60"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {pending && <Spinner />}
          {pending ? "Signing in" : "Sign in"}
        </span>
      </button>

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
