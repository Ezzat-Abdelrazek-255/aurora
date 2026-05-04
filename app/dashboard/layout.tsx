import { redirect } from "next/navigation";
import { isAllowedAdmin } from "../lib/admin";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { DashboardNav } from "./DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth — proxy.ts already gates this, re-check here.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedAdmin(user.email)) {
    redirect("/login?next=/dashboard");
  }

  return (
    <main
      className="min-h-screen bg-white px-6 py-10 text-[#040d08] md:px-10"
      style={{ fontFamily: "var(--font-roslindale-text)" }}
    >
      <header className="mx-auto flex max-w-[1100px] items-baseline justify-between">
        <div>
          <h1
            className="font-serif text-[36px] leading-[1.05] tracking-tight md:text-[44px]"
            style={{ fontFamily: "var(--font-roslindale-display)" }}
          >
            Dashboard
          </h1>
          <p className="mt-2 text-[12.5px] text-neutral-600">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="cursor-pointer text-[11px] uppercase tracking-wide text-neutral-700 transition hover:text-neutral-900"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="mx-auto mt-8 max-w-[1100px]">
        <DashboardNav />
      </div>

      <div className="mx-auto mt-8 max-w-[1100px]">{children}</div>
    </main>
  );
}
