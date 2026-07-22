import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the Node backend so the browser talks to a single
// origin (localhost:5173). This keeps the session cookie same-origin and
// makes CSRF/auth "just work" without CORS gymnastics.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
