import { NextResponse, type NextRequest } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { isAllowedAdmin } from "../../lib/admin";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import type { processVideo } from "../../../trigger/processVideo";

const Body = z.object({
  url: z
    .string()
    .url()
    .refine(
      (s) => /^https?:\/\/vimeo\.com\/\d+\/[a-f0-9]+/i.test(s),
      "Must be a Vimeo URL of the form https://vimeo.com/<id>/<hash>",
    ),
  name: z.string().min(1).max(120),
  category: z.enum(["film-tv", "commercial", "music"]),
  role: z.enum(["Producer", "Talent"]),
});

/**
 * Defense-in-depth allow-list check. The proxy already gates this route,
 * but every API handler re-verifies so an attacker bypassing the proxy
 * (e.g. via direct invocation) still 403s.
 */
async function requireAdmin(): Promise<
  { ok: true } | { ok: false; res: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedAdmin(user.email)) {
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

  const m = parsed.data.url.match(
    /^https?:\/\/vimeo\.com\/(\d+)\/([a-f0-9]+)/i,
  );
  if (!m) {
    return NextResponse.json({ error: "could_not_parse_vimeo_url" }, { status: 400 });
  }
  const [, vimeoId, vimeoHash] = m;

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
