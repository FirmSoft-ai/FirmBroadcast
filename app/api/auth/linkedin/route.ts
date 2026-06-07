/**
 * Starts the LinkedIn OAuth flow.
 *
 * Generates a CSRF `state`, stores it in a short-lived httpOnly cookie, and
 * redirects the browser to LinkedIn's authorize screen. The callback verifies
 * the returned `state` against this cookie.
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildAuthorizeUrl } from "@/lib/linkedin/oauth";

export const dynamic = "force-dynamic";

export const OAUTH_STATE_COOKIE = "li_oauth_state";

export async function GET() {
  const state = randomBytes(16).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes to complete the flow.
  });

  redirect(buildAuthorizeUrl(state));
}
