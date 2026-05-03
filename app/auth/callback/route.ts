import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase/server";

/**
 * Supabase magic-link redirect target. Exchanges the token in the URL for a
 * session cookie, then sends the user to ?next=… (defaults to /dashboard).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Allow-list check happens in proxy.ts on the next request — we just hand
  // off so the magic-link UX is identical for everyone, even if they're not
  // the admin (they'll land on /login with a 403 explanation instead).
  return NextResponse.redirect(`${origin}${next}`);
}
