/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

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

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
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
        token.roles = (user as any).roles;
        token.permissions = (user as any).permissions;
      }
      
      // Handle client-side update() calls
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.image || session.avatar) token.avatar = session.image || session.avatar;
        // Reset cache timer to force DB sync if needed
        (token as any)._avatarFetchedAt = 0;
        return token;
      }

      // Fetch avatar only on sign-in or every 5 minutes (not every request)
      const now = Date.now();
      const lastFetch = (token as any)._avatarFetchedAt as number | undefined;
      if (token.id && (!lastFetch || now - lastFetch > 5 * 60 * 1000)) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: Number(token.id) },
            select: { name: true, avatar: true },
          });
          if (dbUser) {
            token.name = dbUser.name;
            token.avatar = dbUser.avatar;
          }
          (token as any)._avatarFetchedAt = now;
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
      }
      return session;
    },
  },
});
