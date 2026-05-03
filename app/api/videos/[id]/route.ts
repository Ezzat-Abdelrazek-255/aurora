import { NextResponse, type NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import type { processVideo } from "../../../../trigger/processVideo";

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; res: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowed = process.env.ALLOWED_ADMIN_EMAIL?.toLowerCase();
  if (!user || !allowed || user.email?.toLowerCase() !== allowed) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: user ? "forbidden" : "unauthorized" },
        { status: user ? 403 : 401 },
      ),
    };
  }
  return { ok: true };
}

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data: row, error: readErr } = await admin
    .from("videos")
    .select("clip_path,poster_path")
    .eq("vimeo_id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Best-effort storage cleanup.
  const objects = [row.clip_path, row.poster_path].filter(
    (p): p is string => !!p,
  );
  if (objects.length > 0) {
    await admin.storage.from("clips").remove(objects);
  }

  const { error: delErr } = await admin
    .from("videos")
    .delete()
    .eq("vimeo_id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/videos/<id> — re-trigger processing for a row that's stuck in
 * 'failed'. Resets status to 'pending' and fires the task again.
 */
export async function POST(_request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data: row, error: readErr } = await admin
    .from("videos")
    .select("vimeo_id,vimeo_hash,name,category,role")
    .eq("vimeo_id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await admin
    .from("videos")
    .update({ status: "pending", error_message: null })
    .eq("vimeo_id", id);

  try {
    const handle = await tasks.trigger<typeof processVideo>("process-video", {
      vimeoId: row.vimeo_id,
      vimeoHash: row.vimeo_hash,
      name: row.name,
      category: row.category,
      role: row.role,
    });
    return NextResponse.json({ ok: true, runId: handle.id }, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("videos")
      .update({ status: "failed", error_message: `trigger: ${msg}` })
      .eq("vimeo_id", id);
    return NextResponse.json(
      { error: "trigger_failed", message: msg },
      { status: 502 },
    );
  }
}
