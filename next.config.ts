// Load the Node 25+ Web Storage shim first. Next loads this config before
// any app code, so importing here is early enough — and unlike the previous
// NODE_OPTIONS='--require …' approach, this works on Windows.
import "./node-compat.cjs";

import { withSentryConfig } from "@sentry/nextjs";

import type { NextConfig } from "next";

// The sandboxed preview iframe uses srcdoc, whose document HTTP-inherits this
// policy AND applies its own meta CSP — both are enforced, so the preview's
// CDN needs (cdn.tailwindcss.com runtime, esm.sh modules, blob module URLs)
// must stay listed here. cdn.jsdelivr.net serves Monaco's loader and styles
// (@monaco-editor/react defaults to it).
const isDev = process.env.NODE_ENV === "development";
// Monaco's loader evaluates worker code at runtime; 'unsafe-eval' stays in
// dev. Production drops it — if a runtime feature later needs Function
// construction, this is the first place to look (Sentry CSP violations will
// point here).
const scriptEval = isDev ? "'unsafe-eval'" : "";

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${scriptEval} https://cdn.tailwindcss.com https://esm.sh https://cdn.jsdelivr.net blob:`,
  `style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self' https://cdn.tailwindcss.com https://esm.sh https://*.ingest.sentry.io blob:`,
  `font-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net`,
  `frame-src 'self'`,
  `frame-ancestors 'self'`,
  `base-uri 'self'`,
  `form-action 'self' https://accounts.google.com`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(self), camera=(), clipboard-write=(self), fullscreen=(self)",
  },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  silent: true,
  widenClientFileUpload: true,
});
