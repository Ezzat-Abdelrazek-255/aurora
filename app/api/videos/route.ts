import { NextResponse, type NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAdmin } from "../../lib/admin";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { categorySchema, roleSchema } from "../../lib/videos";
import { revalidateVideos } from "../../lib/videos-server";
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

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
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
    });
  if (insertErr) {
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
