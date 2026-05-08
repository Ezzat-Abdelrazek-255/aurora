import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../lib/admin";
import { revalidatePlays } from "../../../lib/plays-server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const Body = z.object({
  positions: z
    .array(
      z.object({
        slug: z.string().min(1),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(500),
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

  const admin = createSupabaseAdminClient();
  const updates = await Promise.all(
    parsed.data.positions.map(({ slug, position }) =>
      admin
        .from("plays")
        .update({ position })
        .eq("slug", slug)
        .select("slug"),
    ),
  );

  const failed = updates
    .map((u, i) => ({ row: parsed.data.positions[i], err: u.error }))
    .filter((x) => x.err);
  if (failed.length > 0) {
    return NextResponse.json(
      {
        error: "partial_failure",
        failed: failed.map((f) => ({ slug: f.row.slug, message: f.err?.message })),
      },
      { status: 500 },
    );
  }

  revalidatePlays();
  return NextResponse.json({ ok: true, count: updates.length });
}
