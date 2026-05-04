import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAllowedAdmin } from "../../../lib/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

const Body = z.object({
  positions: z
    .array(
      z.object({
        vimeo_id: z.string().min(1),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(500),
});

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

/**
 * POST /api/videos/reorder
 * Body: { positions: [{ vimeo_id, position }, ...] }
 *
 * Bulk-updates the `position` column on each referenced row. The dashboard
 * sends the *full* new ordering; rows not present in the body are left
 * untouched. Updates are issued in parallel via service-role.
 */
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
    parsed.data.positions.map(({ vimeo_id, position }) =>
      admin
        .from("videos")
        .update({ position })
        .eq("vimeo_id", vimeo_id)
        .select("vimeo_id"),
    ),
  );

  const failed = updates
    .map((u, i) => ({ row: parsed.data.positions[i], err: u.error }))
    .filter((x) => x.err);
  if (failed.length > 0) {
    return NextResponse.json(
      {
        error: "partial_failure",
        failed: failed.map((f) => ({ vimeo_id: f.row.vimeo_id, message: f.err?.message })),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, count: updates.length });
}
