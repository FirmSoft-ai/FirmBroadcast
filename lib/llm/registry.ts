/**
 * Code-defined registry of available LLM providers.
 *
 * This is the single place to add a new model: register its metadata + adapter
 * factory here and it becomes configurable in Settings and usable for
 * generation, with no schema or UI changes. The DB only stores per-provider
 * credentials, the chosen model, and which provider is active.
 */

import { DeepSeekAdapter } from "@/lib/llm/deepseek";
import { GeminiAdapter } from "@/lib/llm/gemini";
import type { ProviderMeta } from "@/lib/llm/types";

export const PROVIDERS: Record<string, ProviderMeta> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    models: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"],
    defaultModel: "gemini-2.5-flash-lite",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    createAdapter: (apiKey, model) => new GeminiAdapter(apiKey, model),
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    createAdapter: (apiKey, model) => new DeepSeekAdapter(apiKey, model),
  },
};

/** Ordered list of provider keys (stable display order in the UI). */
export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS[id];
}

/** Validate + normalize a model id for a provider, falling back to its default. */
export function resolveModel(providerId: string, model: string | null): string {
  const meta = PROVIDERS[providerId];
  if (!meta) return model ?? "";
  return model && meta.models.includes(model) ? model : meta.defaultModel;
}
