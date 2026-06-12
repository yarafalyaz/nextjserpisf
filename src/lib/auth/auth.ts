
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { takeRateLimit } from "@/lib/security/rate-limit";

// Per-email rate limit: prevents password-spray across many IPs.
// IP-based limit (10/5min) is handled by proxy.ts middleware.
const EMAIL_LIMIT = { windowMs: 30 * 60 * 1000, max: 15 } as const

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
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;

        // Per-email backstop: returns null regardless (same as wrong password)
        const emailLimit = await takeRateLimit(`login:email:${email}`, EMAIL_LIMIT)
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

        if (!user) return null;

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) return null;

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

      // Re-sync profile, roles & permissions on sign-in or every 5 minutes
      // so role/permission revocations (and deactivation) take effect without
      // requiring the user to log out.
      const now = Date.now();
      const lastFetch = token._avatarFetchedAt as number | undefined;
      if (token.id && (!lastFetch || now - lastFetch > 5 * 60 * 1000)) {
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
          token._avatarFetchedAt = now;
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
