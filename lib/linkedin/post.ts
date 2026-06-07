/**
 * LinkedIn publishing via the versioned Posts API.
 *
 * Centralizes everything the publisher worker needs to push a draft live:
 *   - builds the `POST /rest/posts` payload (text-only share),
 *   - sends the required `LinkedIn-Version` + `X-Restli-Protocol-Version`
 *     headers,
 *   - transparently refreshes the access token once on a `401` and retries,
 *   - extracts the created post URN from the response.
 *
 * Only the `author` URN differs between personal (`urn:li:person:{id}`) and
 * company (`urn:li:organization:{id}`) posting, so Phase 6 can reuse this as-is.
 */

import { getLinkedInApiVersion } from "@/lib/env";
import {
  forceRefreshAccessToken,
  getValidAccessToken,
} from "@/lib/linkedin/account";

const POSTS_URL = "https://api.linkedin.com/rest/posts";

export interface PublishPostInput {
  /** Account whose stored token authorizes the post. */
  accountId: string;
  /** Author URN, e.g. `urn:li:person:{id}` or `urn:li:organization:{id}`. */
  authorUrn: string;
  /** Plain-text post body. */
  commentary: string;
}

export interface PublishPostResult {
  /** URN of the created post, e.g. `urn:li:share:...` / `urn:li:ugcPost:...`. */
  urn: string;
}

/** Error carrying the HTTP status + raw body for retry/backoff decisions. */
export class LinkedInPublishError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "LinkedInPublishError";
    this.status = status;
    this.body = body;
  }
}

function buildPayload(authorUrn: string, commentary: string) {
  return {
    author: authorUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
}

async function postOnce(
  authorUrn: string,
  accessToken: string,
  commentary: string,
): Promise<{ status: number; ok: boolean; urn: string | null; body: string }> {
  const res = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": getLinkedInApiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(buildPayload(authorUrn, commentary)),
    cache: "no-store",
  });

  const body = await res.text();
  const urn =
    res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");

  return { status: res.status, ok: res.ok, urn, body };
}

/**
 * Publish `commentary` to LinkedIn as `authorUrn`. Refreshes the token once on a
 * `401` and retries. Throws {@link LinkedInPublishError} on any non-2xx result.
 */
export async function publishPost(
  input: PublishPostInput,
): Promise<PublishPostResult> {
  const { accountId, authorUrn, commentary } = input;

  const text = commentary.trim();
  if (!text) {
    throw new Error("Cannot publish an empty post.");
  }

  let accessToken = await getValidAccessToken(accountId);
  let result = await postOnce(authorUrn, accessToken, text);

  // The recorded expiry can lag reality (revoked/rotated token); force a single
  // refresh on 401 and retry before surfacing the failure.
  if (result.status === 401) {
    accessToken = await forceRefreshAccessToken(accountId);
    result = await postOnce(authorUrn, accessToken, text);
  }

  if (!result.ok) {
    throw new LinkedInPublishError(
      `LinkedIn post failed (${result.status}): ${result.body}`,
      result.status,
      result.body,
    );
  }

  if (!result.urn) {
    throw new LinkedInPublishError(
      "LinkedIn accepted the post but returned no URN.",
      result.status,
      result.body,
    );
  }

  return { urn: result.urn };
}
