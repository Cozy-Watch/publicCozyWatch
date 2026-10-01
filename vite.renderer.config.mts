import { defineConfig } from "vite";

const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com https://api.lemonsqueezy.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';";

const DEVELOPMENT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:*; worker-src 'self' blob:; connect-src 'self' ws: http://localhost:* http://127.0.0.1:* https://api.github.com https://api.lemonsqueezy.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';";

export default defineConfig(({ command }) => ({
  plugins: [{
    name: "renderer-content-security-policy",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: command === "serve" ? DEVELOPMENT_CSP : PRODUCTION_CSP,
        },
        injectTo: "head-prepend",
      }],
    },
  }],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("@radix-ui/themes") ||
            id.includes("@tanstack/react-router")
          ) {
            return "vendor";
          }
        },
      },
    },
  },
}));
