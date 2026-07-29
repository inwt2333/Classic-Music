import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reviewApiPlugin } from "./scripts/review-api";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), reviewApiPlugin()],
});
