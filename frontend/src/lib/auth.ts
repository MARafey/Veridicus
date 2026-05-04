import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  // Use JWT strategy (default) — NextAuth signs the JWT with NEXTAUTH_SECRET.
  // The backend verifies this same JWT using the shared NEXTAUTH_SECRET.
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On first sign-in, persist the Google subject claim into our JWT.
      // This is what the backend uses to look up the Organization.
      if (account && profile) {
        token.googleSub = profile.sub;
        token.email = profile.email;
        token.name = (profile as any).name ?? profile.email;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose sub and email to client session for display
      session.user = {
        ...session.user,
        email: token.email as string,
        name: token.name as string,
      };
      // Expose the NextAuth JWT token so api.ts can attach it as Bearer
      (session as any).accessToken = token;
      return session;
    },
    async signIn({ profile }) {
      if (!profile?.sub || !profile?.email) return true;
      // Auto-create the Organization on first Google sign-in
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        await fetch(`${apiUrl}/admin/orgs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: (profile as any).name || profile.email,
            google_sub: profile.sub,
            admin_email: profile.email,
          }),
        });
      } catch {
        // Org creation failure should not block sign-in
      }
      return true;
    },
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
