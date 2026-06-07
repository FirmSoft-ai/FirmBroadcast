/**
 * Persistence helpers for connected LinkedIn accounts.
 *
 * Tokens are encrypted at rest (see {@link lib/crypto}). The stored author URN
 * is what the publisher later uses as the `author` on `POST /rest/posts`.
 */

import type { Account } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt, encryptNullable } from "@/lib/crypto";
import {
  expiresInToDate,
  refreshAccessToken,
  type LinkedInTokenResponse,
} from "@/lib/linkedin/oauth";

const PROVIDER = "linkedin";

export interface UpsertPersonAccountInput {
  memberId: string;
  token: LinkedInTokenResponse;
  name?: string | null;
  email?: string | null;
}

/** Create or update a personal-profile LinkedIn account from a token grant. */
export async function upsertPersonAccount(
  input: UpsertPersonAccountInput,
): Promise<Account> {
  const { memberId, token, name, email } = input;
  const authorUrn = `urn:li:person:${memberId}`;

  const data = {
    provider: PROVIDER,
    authorType: "PERSON",
    authorUrn,
    providerAccountId: memberId,
    name: name ?? undefined,
    email: email ?? undefined,
    accessToken: encrypt(token.access_token),
    refreshToken: encryptNullable(token.refresh_token),
    expiresAt: expiresInToDate(token.expires_in),
    refreshExpiresAt: expiresInToDate(token.refresh_token_expires_in),
    scope: token.scope,
  };

  return prisma.account.upsert({
    where: { provider_authorUrn: { provider: PROVIDER, authorUrn } },
    create: data,
    update: data,
  });
}

/**
 * Return a valid (non-expired) access token for an account, refreshing it via
 * the stored refresh token when it is within `skewMs` of expiring.
 */
export async function getValidAccessToken(
  accountId: string,
  skewMs = 5 * 60 * 1000,
): Promise<string> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - skewMs > Date.now();
  if (stillValid) {
    return decrypt(account.accessToken);
  }

  if (!account.refreshToken) {
    // No way to refresh; return current token and let the caller handle 401s.
    return decrypt(account.accessToken);
  }

  const token = await refreshAccessToken(decrypt(account.refreshToken));

  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: encrypt(token.access_token),
      refreshToken: token.refresh_token
        ? encrypt(token.refresh_token)
        : account.refreshToken,
      expiresAt: expiresInToDate(token.expires_in),
      refreshExpiresAt:
        expiresInToDate(token.refresh_token_expires_in) ??
        account.refreshExpiresAt,
      scope: token.scope ?? account.scope,
    },
  });

  return token.access_token;
}

/**
 * Force a token refresh regardless of the stored expiry and persist the result.
 *
 * Used by the publisher to recover from a `401` returned mid-publish (the
 * access token was revoked/rotated before its recorded `expiresAt`). Throws if
 * the account has no refresh token to exchange.
 */
export async function forceRefreshAccessToken(
  accountId: string,
): Promise<string> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }
  if (!account.refreshToken) {
    throw new Error(
      `Account ${accountId} has no refresh token; reconnect required.`,
    );
  }

  const token = await refreshAccessToken(decrypt(account.refreshToken));

  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: encrypt(token.access_token),
      refreshToken: token.refresh_token
        ? encrypt(token.refresh_token)
        : account.refreshToken,
      expiresAt: expiresInToDate(token.expires_in),
      refreshExpiresAt:
        expiresInToDate(token.refresh_token_expires_in) ??
        account.refreshExpiresAt,
      scope: token.scope ?? account.scope,
    },
  });

  return token.access_token;
}

/**
 * Pick the account to publish from when a draft has no explicit `accountId`.
 *
 * Personal-profile posting ships first, so a `PERSON` account is preferred;
 * the most recently connected one wins. Returns null when nothing is connected.
 */
export async function getDefaultAccount(): Promise<Account | null> {
  return (
    (await prisma.account.findFirst({
      where: { provider: PROVIDER, authorType: "PERSON" },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.account.findFirst({
      where: { provider: PROVIDER },
      orderBy: { createdAt: "desc" },
    }))
  );
}
