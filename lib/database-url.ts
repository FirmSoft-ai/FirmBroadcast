/** Parse the username from a postgres/postgresql connection string. */
export function parsePostgresUser(url: string): string | undefined {
  const match = url.trim().match(/^postgres(?:ql)?:\/\/([^:@/]+)/i);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Parse the host from a postgres/postgresql connection string. */
export function parsePostgresHost(url: string): string | undefined {
  const match = url.trim().match(/^postgres(?:ql)?:\/\/[^@]*@([^/:?]+)/i);
  return match?.[1];
}

/**
 * Supabase pooler hosts require username `postgres.[project-ref]`.
 * Direct hosts (`db.*.supabase.co`) use plain `postgres`.
 */
export function assertSupabaseCredentials(
  url: string,
  varName: string,
): void {
  const host = parsePostgresHost(url);
  const user = parsePostgresUser(url);
  if (!host || !user) return;

  if (!host.includes("pooler.supabase.com")) return;

  if (user === "postgres") {
    throw new Error(
      `${varName} uses a Supabase pooler host but username "postgres". ` +
        'Pooler URLs require username "postgres.[project-ref]" — copy the full string from Supabase → Connect → ORMs → Prisma. ' +
        'Only direct URLs (db.[project-ref].supabase.co) use username "postgres".',
    );
  }

  if (!user.startsWith("postgres.")) {
    throw new Error(
      `${varName} pooler username should be "postgres.[project-ref]". Got "${user}". ` +
        "Copy the connection string from Supabase → Connect → ORMs → Prisma.",
    );
  }
}
