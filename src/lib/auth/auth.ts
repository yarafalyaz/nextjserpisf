
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { peekRateLimit, takeRateLimit } from "@/lib/security/rate-limit";

// Per-email rate limit: prevents password-spray across many IPs.
// IP-based limit (10/5min) is handled by proxy.ts middleware.
const EMAIL_LIMIT = { windowMs: 30 * 60 * 1000, max: 15 } as const

// bcrypt hash (cost 12, same as real hashes) of a random throwaway string. Used
// to perform equivalent work when the email does not exist, so response time
// cannot be used to enumerate registered accounts. Not a real credential.
const DUMMY_PASSWORD_HASH = "$2b$12$/n/40JlEWgcb9E55Lj3QCuecLxKFP9pvaZdJI9wgs3bkZOwepQ9lq"

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials.password !== "string" ||
          credentials.email.length > 255 ||
          credentials.password.length === 0 ||
          credentials.password.length > 256
        ) return null;

        // Normalize here as well as in form actions: callers can reach the
        // credentials provider directly, so case variants must share both
        // the account lookup and the per-email rate limit.
        const email = (credentials.email as string).trim().toLowerCase();

        // Per-email backstop: returns null regardless (same as wrong password).
        // PEEK only — the attempt is recorded further down, and only when the
        // credentials were wrong, so a user who signs in repeatedly is never
        // locked out by their own successful logins.
        const emailLimit = await peekRateLimit(`login:email:${email}`, EMAIL_LIMIT)
        if (!emailLimit.allowed) return null

        const user = await prisma.user.findUnique({
          where: {
            email,
            isActive: true,
          },
          include: {
            roles: {
              include: {
                permissions: true,
              },
            },
          },
        });

        // Constant work whether or not the account exists. Comparing against a
        // dummy hash when the email is unknown removes the response-time
        // difference that allowed account enumeration (a missing user used to
        // return before any bcrypt work happened).
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user ? user.password : DUMMY_PASSWORD_HASH
        );

        if (!user || !isPasswordValid) {
          // Record the failed attempt against the per-email bucket. Only failures
          // consume quota, so successful logins never count against the user.
          await takeRateLimit(`login:email:${email}`, EMAIL_LIMIT)
          return null
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          isActive: user.isActive,
          passwordHash: user.password.substring(0, 12), // Session binding: track password changes
          roles: user.roles.map((r) => r.name),
          permissions: [
            ...new Set(
              user.roles.flatMap((r) => r.permissions.map((p) => p.name))
            ),
          ],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id ?? "";
        token.name = user.name;
        token.isActive = user.isActive !== false;
        token.passwordHash = user.passwordHash;
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      
      // Handle client-side update() calls
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.image || session.avatar) token.avatar = session.image || session.avatar;
        // Reset cache timer to force DB sync if needed
        token._avatarFetchedAt = 0;
        return token;
      }

      // Re-sync roles & permissions on EVERY request (cheap query) so DB
      // changes take effect on the next request instead of waiting up to 5 min.
      // Avatar fetch is throttled separately to avoid hammering the DB.
      const now = Date.now();
      const lastAvatarFetch = token._avatarFetchedAt as number | undefined;
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: Number(token.id) },
            select: {
              name: true,
              avatar: true,
              isActive: true,
              password: true, // Fetch hash to check for password changes
              roles: { include: { permissions: { select: { name: true } } } },
            },
          });

          // Check for deactivation OR password change.
          // If the stored hash fragment doesn't match the current DB hash,
          // the user has changed their password and we must revoke all other sessions.
          const isPasswordValid = dbUser && token.passwordHash === dbUser.password.substring(0, 12);

          if (dbUser && dbUser.isActive && isPasswordValid) {
            token.name = dbUser.name;
            token.avatar = dbUser.avatar;
            token.isActive = true;
            token.roles = dbUser.roles.map((r) => r.name);
            token.permissions = [
              ...new Set(dbUser.roles.flatMap((r) => r.permissions.map((p) => p.name))),
            ];
          } else {
            // User deleted, deactivated, OR changed password → invalidate the token.
            token.isActive = false;
            token.roles = [];
            token.permissions = [];
          }

          // Throttle only the avatar fetch timestamp (kept for any future avatar logic).
          if (!lastAvatarFetch || now - lastAvatarFetch > 5 * 60 * 1000) {
            token._avatarFetchedAt = now;
          }
        } catch {
          // Silently fail - don't break auth flow
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.image = token.avatar as string | null;
        session.user.roles = token.roles as string[];
        session.user.permissions = token.permissions as string[];
        session.user.isActive = token.isActive !== false;
      }
      return session;
    },
  },
});
