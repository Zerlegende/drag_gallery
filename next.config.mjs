import withPWA from "next-pwa";

const isDev = process.env.NODE_ENV !== "production";

const pwa = withPWA({
  dest: "public",
  disable: isDev,
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?.*\.(?:js|css|woff2?|png|jpg|jpeg|svg|gif|ico)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "static-resources",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
      },
    },
    {
      urlPattern: /^https?.*\.(?:avif|webp|png|jpg|jpeg|gif)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "image-assets",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        },
      },
    },
  ],
});

const nextConfig = pwa({
  reactStrictMode: true,
  turbopack: {}, // Leere Turbopack-Config um Warnung zu vermeiden
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
      },
      {
        protocol: "http",
        hostname: "*",
      },
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    qualities: [50, 75, 90], // Explizit erlaubte Quality-Werte
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 Tage Cache
    dangerouslyAllowSVG: false,
    contentDispositionType: 'inline',
    unoptimized: false,
  },
});

export default nextConfig;
