import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../lib/admin";
import { playCategorySchema, playRoleSchema } from "../../../lib/plays";
import { revalidatePlays } from "../../../lib/plays-server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const PatchBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    category: playCategorySchema.optional(),
    role: playRoleSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

type Ctx = { params: Promise<{ slug: string }> };

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { slug } = await ctx.params;
  const admin = createSupabaseAdminClient();

  const { data: row, error: readErr } = await admin
    .from("plays")
    .select("gallery_paths")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Best-effort storage cleanup. Includes any extra objects sitting under the
  // play's prefix that aren't tracked in gallery_paths (orphans from a failed
  // upload, etc.).
  const tracked = (row.gallery_paths as string[] | null) ?? [];
  const bucket = admin.storage.from("clips");
  const { data: listed } = await bucket.list(`plays/${slug}`);
  const orphans = (listed ?? []).map((o) => `plays/${slug}/${o.name}`);
  const all = Array.from(new Set([...tracked, ...orphans]));
  if (all.length > 0) {
    await bucket.remove(all);
  }

  const { error: delErr } = await admin
    .from("plays")
    .delete()
    .eq("slug", slug);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  revalidatePlays();
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { slug } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("plays")
    .update(parsed.data)
    .eq("slug", slug)
    .select("slug,name,category,role")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  revalidatePlays();
  return NextResponse.json({ ok: true, play: data });
}
