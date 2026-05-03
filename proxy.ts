import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Auth gate for /dashboard and /api/videos*. Refreshes the Supabase session
 * cookies on every request, then redirects unauthenticated visitors to
 * /login and 403s any authenticated user that isn't on the allow-list.
 *
 * Defense in depth: each protected API route should re-verify the email
 * allow-list inside its own handler — never trust the proxy alone.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession()) revalidates the JWT on the
  // Supabase server — never trust an unverified session cookie for auth gates.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const isApi = url.pathname.startsWith("/api/videos");
  const isDashboard = url.pathname.startsWith("/dashboard");
  if (!isApi && !isDashboard) return response;

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const next = url.pathname + url.search;
    const redirect = new URL("/login", request.url);
    redirect.searchParams.set("next", next);
    return NextResponse.redirect(redirect);
  }

  const allowed = process.env.ALLOWED_ADMIN_EMAIL?.toLowerCase();
  if (!allowed || user.email?.toLowerCase() !== allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return response;
}

export const config = {
  // Only run the proxy where it matters. Static assets, images, and the
  // public homepage skip it entirely.
  matcher: ["/dashboard/:path*", "/api/videos/:path*"],
};
