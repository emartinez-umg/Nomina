import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    base: env.VITE_NOM_BASE_PATH || '/nomina',
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            forms: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-switch',
            ],
            schema: ['../shared/schema.json'],
          },
        },
      },
    },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        [env.VITE_NOM_API_BASE || '/api/nomina']: {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
