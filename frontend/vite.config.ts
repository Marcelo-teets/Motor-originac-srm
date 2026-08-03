import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-router-dom': fileURLToPath(
        new URL('./src/lib/reactRouterCompat.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
});
