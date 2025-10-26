export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/api/upload", "/api/images/:path*"],
};
