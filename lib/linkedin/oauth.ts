/**
 * LinkedIn OAuth 2.0 (Authorization Code) helpers for personal-profile posting.
 *
 * Flow:
 *   1. Redirect the user to {@link buildAuthorizeUrl} with a CSRF `state`.
 *   2. LinkedIn redirects back to our callback with `code` + `state`.
 *   3. {@link exchangeCodeForToken} swaps the code for access/refresh tokens.
 *   4. {@link fetchUserInfo} resolves the member id (OpenID `sub`) + profile.
 *
 * Tokens expire in ~60 days; refresh tokens last ~365 days. Use
 * {@link refreshAccessToken} (requires the app to have programmatic refresh
 * enabled) to renew before expiry.
 */

import { getLinkedInConfig } from "@/lib/env";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

/**
 * Scopes requested for personal posting:
 *  - `openid` + `profile`: OpenID Connect identity (member id via `sub`).
 *  - `email`: populate the account's email (granted by the OIDC product).
 *  - `w_member_social`: create posts on the member's behalf.
 */
export const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string;
  refresh_token_expires_in?: number; // seconds
  scope?: string;
  token_type?: string;
}

export interface LinkedInUserInfo {
  sub: string; // member id (use in urn:li:person:{sub})
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  locale?: string | { country: string; language: string };
}

/** Build the LinkedIn authorize URL the user is redirected to. */
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getLinkedInConfig();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(" "),
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchange an authorization `code` for access + refresh tokens. */
export async function exchangeCodeForToken(
  code: string,
): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  return postToken(body);
}

/** Renew an access token using a long-lived refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret } = getLinkedInConfig();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  return postToken(body);
}

async function postToken(
  body: URLSearchParams,
): Promise<LinkedInTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `LinkedIn token request failed (${res.status}): ${text}`,
    );
  }

  return JSON.parse(text) as LinkedInTokenResponse;
}

/** Fetch the authenticated member's OpenID profile. */
export async function fetchUserInfo(
  accessToken: string,
): Promise<LinkedInUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `LinkedIn userinfo request failed (${res.status}): ${text}`,
    );
  }

  return JSON.parse(text) as LinkedInUserInfo;
}

/** Convert a token's `expires_in` (seconds) into an absolute Date. */
export function expiresInToDate(
  expiresIn: number | undefined,
): Date | null {
  if (!expiresIn || Number.isNaN(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000);
}
