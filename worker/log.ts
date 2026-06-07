/** Minimal timestamped logger shared by the worker processes. */

type Fields = Record<string, unknown>;

function format(scope: string, message: string, fields?: Fields): string {
  const ts = new Date().toISOString();
  const extra =
    fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
  return `${ts} [${scope}] ${message}${extra}`;
}

export function createLogger(scope: string) {
  return {
    info(message: string, fields?: Fields) {
      console.log(format(scope, message, fields));
    },
    warn(message: string, fields?: Fields) {
      console.warn(format(scope, message, fields));
    },
    error(message: string, fields?: Fields) {
      console.error(format(scope, message, fields));
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
