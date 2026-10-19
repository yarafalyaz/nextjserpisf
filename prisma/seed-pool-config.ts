/**
 * Hosts where fetching the server's RSA public key on demand is safe.
 *
 * MySQL 8 defaults to `caching_sha2_password`, which needs that key for the
 * first (uncached) login over TCP. The mariadb driver refuses to fetch it
 * unless told to, so `npm run db:seed` dies with ER_CANNOT_RETRIEVE_RSA_KEY
 * while the app itself connects fine. The exception stays loopback-only:
 * retrieving the key over an unencrypted link lets an active man-in-the-middle
 * answer with its own key and read the password — a real risk for a remote
 * database, no risk on the operator's own machine.
 */
function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

const DATABASE_SOCKET_PATH = process.env.DATABASE_SOCKET_PATH;
// S5443: tidak ada fallback socket /tmp yang dapat ditulis publik. Socket hanya
// dari DATABASE_SOCKET_PATH (env operator) atau dari query
// `socketPath`/`socket` di DATABASE_URL. Tanpa keduanya, DATABASE_URL wajib ada.
export function buildPoolConfig(options: { includeAllowPublicKeyRetrieval?: boolean } = {}) {
  const { includeAllowPublicKeyRetrieval = true } = options;
  const fallback = DATABASE_SOCKET_PATH
    ? {
        socketPath: DATABASE_SOCKET_PATH,
        user: "root",
        password: "",
        database: "yara_erp",
        connectionLimit: 5,
      }
    : null;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (fallback) return fallback;
    throw new Error(
      "DATABASE_URL wajib diisi (atau set DATABASE_SOCKET_PATH ke socket MySQL lokal)",
    );
  }

  try {
    const parsed = new URL(databaseUrl);
    const socketPath =
      parsed.searchParams.get("socketPath") ||
      parsed.searchParams.get("socket");
    const database =
      decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "yara_erp";
    const user = decodeURIComponent(parsed.username || "root");
    const password = decodeURIComponent(parsed.password || "");
    const connectionLimit = Number(
      parsed.searchParams.get("connectionLimit") || 5,
    );

    if (socketPath) {
      return { socketPath, user, password, database, connectionLimit };
    }

    const host = parsed.hostname || "127.0.0.1";
    if (!includeAllowPublicKeyRetrieval) {
      return {
        host,
        port: parsed.port ? Number(parsed.port) : 3306,
        user,
        password,
        database,
        connectionLimit,
      };
    }
    // Driver options arrive as URL query params (Prisma style) and were dropped
    // silently before. `allowPublicKeyRetrieval` defaults on for a local
    // database and can be forced either way from the URL.
    const allowPublicKeyRetrieval = parsed.searchParams.has("allowPublicKeyRetrieval")
      ? parsed.searchParams.get("allowPublicKeyRetrieval") === "true"
      : isLoopbackHost(host);

    return {
      host,
      port: parsed.port ? Number(parsed.port) : 3306,
      user,
      password,
      database,
      connectionLimit,
      allowPublicKeyRetrieval,
    };
  } catch {
    if (fallback) return fallback;
    throw new Error(
      "DATABASE_URL wajib diisi (atau set DATABASE_SOCKET_PATH ke socket MySQL lokal)",
    );
  }
}
