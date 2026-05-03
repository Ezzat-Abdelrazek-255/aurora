import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { AddVideoForm } from "./AddVideoForm";
import { VideoTable, type DashboardRow } from "./VideoTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Defense in depth — proxy.ts already gates this, re-check here.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowed = process.env.ALLOWED_ADMIN_EMAIL?.toLowerCase();
  if (
    !user ||
    !allowed ||
    user.email?.toLowerCase() !== allowed
  ) {
    redirect("/login?next=/dashboard");
  }

  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("videos")
    .select(
      "vimeo_id,vimeo_hash,name,category,role,status,clip_path,poster_path,error_message,position,created_at",
    )
    .order("position");

  const initial: DashboardRow[] = (rows ?? []).map((r) => {
    const posterUrl = r.poster_path
      ? admin.storage.from("clips").getPublicUrl(r.poster_path).data.publicUrl
      : null;
    return {
      vimeo_id: r.vimeo_id,
      vimeo_hash: r.vimeo_hash,
      name: r.name,
      category: r.category,
      role: r.role,
      status: r.status,
      poster_url: posterUrl,
      error_message: r.error_message,
      position: r.position,
      created_at: r.created_at,
    };
  });

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
            Manage videos
          </h1>
          <p className="mt-2 text-[12.5px] text-neutral-600">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-[12px] tracking-wide text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mx-auto mt-10 max-w-[1100px]">
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          Add a video
        </h2>
        <AddVideoForm />
      </section>

      <section className="mx-auto mt-12 max-w-[1100px]">
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          All videos
        </h2>
        {error && (
          <p className="mt-2 text-[12.5px] text-red-700">
            Failed to load: {error.message}
          </p>
        )}
        <VideoTable initial={initial} />
      </section>
    </main>
  );
}
