/**
 * App settings endpoint powering the Settings page.
 *
 *   GET /api/settings  -> AI providers (key presence only, never the raw key),
 *                         the active provider, and generation/publishing schedules
 *   PUT /api/settings  -> update provider keys/models, the active provider,
 *                         and/or the schedules
 *
 * API keys are encrypted at rest; they are never serialized back to the client.
 */

import { NextResponse, type NextRequest } from "next/server";
import { encrypt } from "@/lib/crypto";
import { PROVIDERS, PROVIDER_IDS, resolveModel } from "@/lib/llm/registry";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_GENERATION_SCHEDULE,
  DEFAULT_PUBLISHING_SCHEDULE,
  describeSchedule,
  normalizeSchedule,
  parseSchedule,
  serializeSchedule,
} from "@/lib/schedule";
import { getAppSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, setting] = await Promise.all([
    prisma.llmProvider.findMany(),
    getAppSetting(),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));

  const providers = PROVIDER_IDS.map((id) => {
    const meta = PROVIDERS[id];
    const row = byId.get(id);
    return {
      id: meta.id,
      label: meta.label,
      models: meta.models,
      defaultModel: meta.defaultModel,
      apiKeyUrl: meta.apiKeyUrl,
      model: resolveModel(id, row?.model ?? null),
      keySet: Boolean(row?.apiKey),
      isActive: Boolean(row?.isActive),
    };
  });

  const generationSchedule = parseSchedule(
    setting.generationSchedule,
    DEFAULT_GENERATION_SCHEDULE,
  );
  const publishingSchedule = parseSchedule(
    setting.publishingSchedule,
    DEFAULT_PUBLISHING_SCHEDULE,
  );

  return NextResponse.json({
    providers,
    activeProvider: providers.find((p) => p.isActive)?.id ?? null,
    generation: {
      enabled: setting.generationEnabled,
      schedule: generationSchedule,
      description: describeSchedule(generationSchedule),
      lastRunAt: setting.lastGenerationAt,
    },
    publishing: {
      enabled: setting.publishingEnabled,
      schedule: publishingSchedule,
      description: describeSchedule(publishingSchedule),
      lastRunAt: setting.lastPublishAt,
    },
  });
}

interface ProviderUpdate {
  id?: unknown;
  apiKey?: unknown;
  model?: unknown;
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  // 1) Per-provider key + model updates (upsert each touched provider row).
  if (Array.isArray(data.providers)) {
    for (const entry of data.providers as ProviderUpdate[]) {
      const id = typeof entry.id === "string" ? entry.id : "";
      const meta = PROVIDERS[id];
      if (!meta) {
        return NextResponse.json(
          { error: `Unknown provider "${id}"` },
          { status: 400 },
        );
      }

      const update: { apiKey?: string | null; model?: string } = {};

      if ("apiKey" in entry) {
        if (entry.apiKey === null) {
          update.apiKey = null;
        } else if (typeof entry.apiKey === "string" && entry.apiKey.trim()) {
          update.apiKey = encrypt(entry.apiKey.trim());
        }
        // empty string / other -> leave unchanged
      }

      if (typeof entry.model === "string") {
        update.model = resolveModel(id, entry.model);
      }

      if (Object.keys(update).length === 0) continue;

      await prisma.llmProvider.upsert({
        where: { id },
        create: { id, ...update },
        update,
      });
    }
  }

  // 2) Active provider selection (exactly one active).
  if (typeof data.activeProvider === "string") {
    const id = data.activeProvider;
    if (!PROVIDERS[id]) {
      return NextResponse.json(
        { error: `Unknown provider "${id}"` },
        { status: 400 },
      );
    }
    await prisma.llmProvider.upsert({
      where: { id },
      create: { id, isActive: true },
      update: { isActive: true },
    });
    await prisma.llmProvider.updateMany({
      where: { id: { not: id } },
      data: { isActive: false },
    });
  }

  // 3) Schedules (generation + publishing).
  const settingUpdate: Record<string, unknown> = {};

  if (data.generation && typeof data.generation === "object") {
    const g = data.generation as Record<string, unknown>;
    if (typeof g.enabled === "boolean") settingUpdate.generationEnabled = g.enabled;
    if (g.schedule !== undefined) {
      settingUpdate.generationSchedule = serializeSchedule(
        normalizeSchedule(g.schedule),
      );
    }
  }

  if (data.publishing && typeof data.publishing === "object") {
    const p = data.publishing as Record<string, unknown>;
    if (typeof p.enabled === "boolean") settingUpdate.publishingEnabled = p.enabled;
    if (p.schedule !== undefined) {
      settingUpdate.publishingSchedule = serializeSchedule(
        normalizeSchedule(p.schedule),
      );
    }
  }

  if (Object.keys(settingUpdate).length > 0) {
    await prisma.appSetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...settingUpdate },
      update: settingUpdate,
    });
  }

  return GET();
}
