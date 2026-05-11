import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
