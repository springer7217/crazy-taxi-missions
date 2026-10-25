import { defineConfig } from "vite";

export default defineConfig({
  base: "/crazy-taxi-missions/",
  server: { host: "0.0.0.0", port: 4731, strictPort: true },
  preview: { host: "0.0.0.0", port: 4731, strictPort: true },
});
