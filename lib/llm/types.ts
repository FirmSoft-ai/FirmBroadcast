/**
 * Shared contracts for the universal LLM layer.
 *
 * Each supported model implements {@link LLMAdapter}; the registry
 * (`lib/llm/registry.ts`) maps a provider key to its metadata + an adapter
 * factory. `lib/llm/index.ts` resolves the active provider from the DB and
 * drives generation through this single interface.
 */

import type { PostLength, PostTone } from "@/lib/post-options";

export interface GenerateArgs {
  systemPrompt: string;
  userPrompt: string;
  tone: PostTone;
  length: PostLength;
}

/** A concrete model client capable of turning prompts into post text. */
export interface LLMAdapter {
  /** Generate raw (un-sanitized) post text. Throws on API/usage errors. */
  generate(args: GenerateArgs): Promise<string>;
}

/** Static, code-defined metadata describing an available provider. */
export interface ProviderMeta {
  /** Stable provider key, persisted as `LlmProvider.id` (e.g. "gemini"). */
  id: string;
  /** Human-friendly label for the Settings UI. */
  label: string;
  /** Selectable model ids; the first is treated as the default. */
  models: string[];
  /** Default model id used when none is configured. */
  defaultModel: string;
  /** Where the user obtains an API key (shown as a hint in Settings). */
  apiKeyUrl: string;
  /** Build an adapter bound to a concrete API key + model. */
  createAdapter(apiKey: string, model: string): LLMAdapter;
}
