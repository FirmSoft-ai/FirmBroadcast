/**
 * Universal post generation entry point.
 *
 * {@link generatePost} is the single function shared by the Post Generator page,
 * the regenerate endpoint, and the scheduler worker. It resolves the active
 * provider from the DB (`LlmProvider`), decrypts its API key, builds the
 * matching adapter from the registry, and returns sanitized post text.
 *
 * Swapping models is a settings change — callers are provider-agnostic.
 */

import { decrypt } from "@/lib/crypto";
import { getProviderMeta, resolveModel } from "@/lib/llm/registry";
import {
  buildSystemPrompt,
  buildUserPrompt,
  sanitize,
} from "@/lib/llm/prompt";
import { prisma } from "@/lib/prisma";
import type { PostLength, PostTone } from "@/lib/post-options";

export type { PostLength, PostTone } from "@/lib/post-options";

export interface GeneratePostOptions {
  tone?: PostTone;
  length?: PostLength;
  /** Optional extra steering, e.g. audience or call-to-action specifics. */
  instructions?: string;
}

export interface GeneratePostResult {
  content: string;
  provider: string;
  model: string;
  tone: PostTone;
  length: PostLength;
}

const DEFAULT_TONE: PostTone = "professional";
const DEFAULT_LENGTH: PostLength = "medium";

/** Resolve the active provider row + a usable adapter, or throw a clear error. */
async function resolveActiveAdapter() {
  const active = await prisma.llmProvider.findFirst({
    where: { isActive: true },
  });

  if (!active) {
    throw new Error(
      "No AI model is configured. Add a provider API key and select an active model in Settings.",
    );
  }

  const meta = getProviderMeta(active.id);
  if (!meta) {
    throw new Error(`Unknown AI provider "${active.id}". Update your settings.`);
  }

  if (!active.apiKey) {
    throw new Error(
      `No API key set for ${meta.label}. Add it in Settings before generating.`,
    );
  }

  const model = resolveModel(active.id, active.model);
  const apiKey = decrypt(active.apiKey);

  return { adapter: meta.createAdapter(apiKey, model), provider: meta.id, model };
}

/**
 * Generate a LinkedIn post for `topic` using the active provider. Throws if no
 * provider/key is configured or the model returns no usable text.
 */
export async function generatePost(
  topic: string,
  options: GeneratePostOptions = {},
): Promise<GeneratePostResult> {
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) {
    throw new Error("A topic is required to generate a post.");
  }

  const tone = options.tone ?? DEFAULT_TONE;
  const length = options.length ?? DEFAULT_LENGTH;

  const { adapter, provider, model } = await resolveActiveAdapter();

  const raw = await adapter.generate({
    systemPrompt: buildSystemPrompt(tone, length),
    userPrompt: buildUserPrompt(trimmedTopic, options.instructions),
    tone,
    length,
  });

  return { content: sanitize(raw), provider, model, tone, length };
}
