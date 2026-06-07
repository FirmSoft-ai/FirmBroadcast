/**
 * LinkedIn OAuth callback.
 *
 * Verifies the CSRF `state`, exchanges the authorization `code` for tokens,
 * fetches the member's OpenID profile, and persists an encrypted `Account`.
 * Redirects back to the dashboard with a success or error flag.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  exchangeCodeForToken,
  fetchUserInfo,
} from "@/lib/linkedin/oauth";
import { upsertPersonAccount } from "@/lib/linkedin/account";
import { OAUTH_STATE_COOKIE } from "../route";

export const dynamic = "force-dynamic";

function redirectHome(params: Record<string, string>): NextResponse {
  const url = new URL("/", env.APP_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(url);
  // The state cookie is single-use; clear it on the way out.
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const oauthError = params.get("error");
  if (oauthError) {
    const description = params.get("error_description") ?? oauthError;
    return redirectHome({ connected: "0", error: description });
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return redirectHome({ connected: "0", error: "Missing code or state" });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return redirectHome({ connected: "0", error: "Invalid OAuth state" });
  }

  try {
    const token = await exchangeCodeForToken(code);
    const profile = await fetchUserInfo(token.access_token);

    const account = await upsertPersonAccount({
      memberId: profile.sub,
      token,
      name: profile.name ?? null,
      email: profile.email ?? null,
    });

    return redirectHome({
      connected: "1",
      account: account.name ?? account.authorUrn,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return redirectHome({ connected: "0", error: message });
  }
}
