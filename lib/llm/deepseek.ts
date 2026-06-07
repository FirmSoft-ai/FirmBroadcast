/**
 * DeepSeek adapter for the universal LLM layer.
 *
 * DeepSeek exposes an OpenAI-compatible Chat Completions endpoint, so this
 * adapter talks to it directly with `fetch` (no extra SDK dependency). The API
 * key + model are injected by the registry from DB-managed settings.
 */

import type { GenerateArgs, LLMAdapter } from "@/lib/llm/types";

const CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export class DeepSeekAdapter implements LLMAdapter {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate({
    systemPrompt,
    userPrompt,
  }: GenerateArgs): Promise<string> {
    const res = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 1024,
      }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as ChatCompletionResponse;

    if (!res.ok) {
      const message = data.error?.message ?? `DeepSeek request failed (${res.status}).`;
      throw new Error(message);
    }

    const raw = data.choices?.[0]?.message?.content;
    if (!raw || !raw.trim()) {
      throw new Error("DeepSeek returned an empty response.");
    }
    return raw;
  }
}
