import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface User extends DefaultUser {
    roles: string[];
    permissions: string[];
    isActive?: boolean;
  }

  interface Session {
    user: {
      id: string;
      roles: string[];
      permissions: string[];
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    roles: string[];
    permissions: string[];
    isActive: boolean;
  }
}
