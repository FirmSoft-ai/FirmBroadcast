import { createBrowserClient } from "@supabase/ssr";

function getPublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }
  return key;
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getPublishableKey(),
  );
}
