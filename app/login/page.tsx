import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { createSupabaseServerClient } from "../lib/supabase/server";

type SearchParams = Promise<{
  next?: string;
  sent?: string;
  error?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // If the visitor is already signed in *and* on the allow-list, send them
  // straight through.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sp = await searchParams;
  const next = sp.next ?? "/dashboard";

  if (
    user &&
    process.env.ALLOWED_ADMIN_EMAIL &&
    user.email?.toLowerCase() === process.env.ALLOWED_ADMIN_EMAIL.toLowerCase()
  ) {
    redirect(next);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 text-[#040d08]">
      <div className="w-full max-w-sm">
        <h1
          className="font-serif text-[40px] leading-[1.05] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          Sign in
        </h1>
        <p
          className="mt-3 text-[13px] leading-relaxed text-neutral-600"
          style={{ fontFamily: "var(--font-roslindale-text)" }}
        >
          Enter your email and we'll send you a one-time link. Only the
          allow-listed admin email can access the dashboard.
        </p>

        <LoginForm next={next} sent={sp.sent === "1"} error={sp.error} />
      </div>
    </main>
  );
}
