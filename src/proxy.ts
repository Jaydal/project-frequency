import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/members/:path*",
    "/wallet/:path*",
    "/courts/:path*",
    "/settings/:path*",
    "/reports/:path*",
    "/rfid/:path*",
    "/((?!login|api|_next/static|_next/image|favicon.ico).*)",
  ]
};
