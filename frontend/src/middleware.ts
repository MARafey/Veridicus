import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Redirect authenticated users away from the landing page
    if (req.nextUrl.pathname === "/" && req.nextauth.token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ req, token }) {
        const { pathname } = req.nextUrl;
        const PROTECTED = ["/dashboard", "/upload", "/assessment", "/admin"];
        if (PROTECTED.some((p) => pathname.startsWith(p))) {
          return !!token;
        }
        return true; // public routes always allowed
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png).*)",
  ],
};
