import type { Metadata } from "next";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { AddVideoForm } from "./AddVideoForm";
import { VideoTable, type DashboardRow } from "./VideoTable";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardPage() {
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
    <>
      <section>
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          Add a video
        </h2>
        <AddVideoForm />
      </section>

      <section className="mt-12">
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
    </>
  );
}
