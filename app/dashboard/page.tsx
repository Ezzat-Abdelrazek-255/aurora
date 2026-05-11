import type { Metadata } from "next";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { AddPlayForm } from "./AddPlayForm";
import { AddStillForm } from "./AddStillForm";
import { AddVideoForm } from "./AddVideoForm";
import { PlaysTable, type DashboardPlayRow } from "./PlaysTable";
import { VideoTable, type DashboardRow } from "./VideoTable";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardPage() {
  const admin = createSupabaseAdminClient();
  const bucket = admin.storage.from("clips");

  const [videosRes, playsRes] = await Promise.all([
    admin
      .from("videos")
      .select(
        "vimeo_id,vimeo_hash,name,category,role,status,clip_path,poster_path,custom_poster_path,error_message,position,created_at",
      )
      .order("position"),
    admin
      .from("plays")
      .select(
        "slug,name,category,role,status,kind,cover_path,gallery_paths,error_message,position,created_at",
      )
      .order("position"),
  ]);

  const initial: DashboardRow[] = (videosRes.data ?? []).map((r) => {
    const posterUrl = r.poster_path
      ? bucket.getPublicUrl(r.poster_path).data.publicUrl
      : null;
    const customPosterUrl = r.custom_poster_path
      ? bucket.getPublicUrl(r.custom_poster_path).data.publicUrl
      : null;
    return {
      vimeo_id: r.vimeo_id,
      vimeo_hash: r.vimeo_hash,
      name: r.name,
      category: r.category,
      role: r.role,
      status: r.status,
      poster_url: posterUrl,
      custom_poster_url: customPosterUrl,
      error_message: r.error_message,
      position: r.position,
      created_at: r.created_at,
    };
  });

  const initialPlays: DashboardPlayRow[] = (playsRes.data ?? []).map((r) => {
    const paths = ((r.gallery_paths as string[] | null) ?? []);
    return {
      slug: r.slug,
      name: r.name,
      category: r.category,
      role: r.role,
      status: r.status,
      kind: r.kind ?? "play",
      cover_url: r.cover_path ? bucket.getPublicUrl(r.cover_path).data.publicUrl : null,
      gallery_urls: paths.map((p) => bucket.getPublicUrl(p).data.publicUrl),
      gallery_paths: paths,
      error_message: r.error_message,
      position: r.position,
      created_at: r.created_at,
    };
  });

  const playRows = initialPlays.filter((r) => r.kind === "play");
  const stillRows = initialPlays.filter((r) => r.kind === "still");

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
        {videosRes.error && (
          <p className="mt-2 text-[12.5px] text-red-700">
            Failed to load: {videosRes.error.message}
          </p>
        )}
        <VideoTable initial={initial} />
      </section>

      <section className="mt-16">
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          Add a play
        </h2>
        <AddPlayForm />
      </section>

      <section className="mt-12">
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          All plays
        </h2>
        {playsRes.error && (
          <p className="mt-2 text-[12.5px] text-red-700">
            Failed to load: {playsRes.error.message}
          </p>
        )}
        <PlaysTable initial={playRows} kind="play" />
      </section>

      <section className="mt-16">
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          Add a still
        </h2>
        <AddStillForm />
      </section>

      <section className="mt-12">
        <h2
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          All stills
        </h2>
        {playsRes.error && (
          <p className="mt-2 text-[12.5px] text-red-700">
            Failed to load: {playsRes.error.message}
          </p>
        )}
        <PlaysTable initial={stillRows} kind="still" />
      </section>
    </>
  );
}
