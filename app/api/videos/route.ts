import { NextResponse, type NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAdmin } from "../../lib/admin";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { categorySchema, roleSchema } from "../../lib/videos";
import { revalidateVideos } from "../../lib/videos-server";
import { uploadCustomPoster } from "../../lib/customPoster";
import { resolveVimeoHash } from "../../../trigger/lib/vimeo";
import type { processVideo } from "../../../trigger/processVideo";

// Accept either form: https://vimeo.com/<id> or https://vimeo.com/<id>/<hash>.
// Bare-ID URLs (the address-bar form for unlisted videos) get their hash
// resolved server-side by scraping the public watch page.
const VIMEO_URL_RE = /^https?:\/\/vimeo\.com\/(\d+)(?:\/([a-f0-9]+))?/i;

const Body = z.object({
  url: z
    .string()
    .url()
    .refine(
      (s) => VIMEO_URL_RE.test(s),
      "Must be a Vimeo URL like https://vimeo.com/<id> or https://vimeo.com/<id>/<hash>",
    ),
  name: z.string().min(1).max(120),
  category: categorySchema,
  role: roleSchema,
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  // The dashboard form always sends multipart so it can attach an optional
  // thumbnail. Older JSON callers still work — we fall through to JSON when
  // the content-type isn't multipart.
  const ct = request.headers.get("content-type") ?? "";
  let payload: unknown;
  let thumbnail: File | null = null;
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "invalid_body", message: "Expected multipart/form-data" },
        { status: 400 },
      );
    }
    payload = {
      url: form.get("url"),
      name: form.get("name"),
      category: form.get("category"),
      role: form.get("role"),
    };
    const thumb = form.get("thumbnail");
    if (thumb instanceof File && thumb.size > 0) thumbnail = thumb;
  } else {
    payload = await request.json().catch(() => null);
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const m = parsed.data.url.match(VIMEO_URL_RE);
  if (!m) {
    return NextResponse.json({ error: "could_not_parse_vimeo_url" }, { status: 400 });
  }
  const [, vimeoId, urlHash] = m;
  const vimeoHash = urlHash ?? (await resolveVimeoHash(vimeoId));
  if (!vimeoHash) {
    return NextResponse.json(
      {
        error: "could_not_resolve_hash",
        message:
          "Vimeo didn't return an embed hash for this video. The video may be private/password-gated; paste the full https://vimeo.com/<id>/<hash> URL instead.",
      },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  // Upload the custom thumbnail before inserting the row so we can record its
  // path in the same insert (and avoid a partial state if the upload fails).
  let customPosterPath: string | null = null;
  if (thumbnail) {
    try {
      customPosterPath = await uploadCustomPoster(admin, vimeoId, thumbnail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "thumbnail_upload_failed", message: msg },
        { status: 500 },
      );
    }
  }

  // Insert as 'pending'. If the row already exists, return 409 — the user
  // can delete and re-add or trigger a retry.
  const { error: insertErr } = await admin
    .from("videos")
    .insert({
      vimeo_id: vimeoId,
      vimeo_hash: vimeoHash,
      name: parsed.data.name,
      category: parsed.data.category,
      role: parsed.data.role,
      status: "pending",
      custom_poster_path: customPosterPath,
    });
  if (insertErr) {
    if (customPosterPath) {
      await admin.storage.from("clips").remove([customPosterPath]);
    }
    if (/duplicate|unique/i.test(insertErr.message)) {
      return NextResponse.json(
        { error: "already_exists", vimeo_id: vimeoId },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "insert_failed", message: insertErr.message },
      { status: 500 },
    );
  }

  try {
    const handle = await tasks.trigger<typeof processVideo>("process-video", {
      vimeoId,
      vimeoHash,
      name: parsed.data.name,
      category: parsed.data.category,
      role: parsed.data.role,
    });
    revalidateVideos();
    return NextResponse.json(
      { ok: true, vimeo_id: vimeoId, runId: handle.id },
      { status: 202 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If we couldn't trigger the task, mark the row failed so the dashboard
    // surfaces it.
    await admin
      .from("videos")
      .update({ status: "failed", error_message: `trigger: ${msg}` })
      .eq("vimeo_id", vimeoId);
    return NextResponse.json(
      { error: "trigger_failed", message: msg },
      { status: 502 },
    );
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("videos")
    .select("*")
    .order("position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ videos: data ?? [] });
}

