import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../lib/admin";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

const Link = z.object({ label: z.string().max(120), url: z.string().url() });
const Body = z.object({
  bio: z.string().max(8000),
  awards: z
    .array(
      z.object({
        year: z.string().max(20),
        kind: z.string().max(200),
        body: z.string().max(400),
      }),
    )
    .max(50),
  production_email: z.string().max(200),
  commercial: z.object({
    name: z.string().max(200),
    email: z.string().max(200),
  }),
  reforest: z.object({
    body: z.string().max(4000),
    links: z.array(Link).max(20),
  }),
  connect_links: z.array(Link).max(20),
});

export async function PUT(request: NextRequest) {
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

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("about_content")
    .upsert({ id: 1, content: parsed.data, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json(
      { error: "save_failed", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
