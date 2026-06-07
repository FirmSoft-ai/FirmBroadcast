/**
 * Gemini adapter for the universal LLM layer.
 *
 * Wraps Google's unified Gen AI SDK (`@google/genai`). The API key + model are
 * injected by the registry from DB-managed settings, so this file no longer
 * reads any environment variables.
 */

import { GoogleGenAI } from "@google/genai";
import type { GenerateArgs, LLMAdapter } from "@/lib/llm/types";

export class GeminiAdapter implements LLMAdapter {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generate({ systemPrompt, userPrompt }: GenerateArgs): Promise<string> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.9,
        maxOutputTokens: 1024,
      },
    });

    const raw = response.text;
    if (!raw || !raw.trim()) {
      throw new Error("Gemini returned an empty response.");
    }
    return raw;
  }
}
