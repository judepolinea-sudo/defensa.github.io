import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Split big, rarely-changing vendor code into its own long-cached
        // chunks so the first paint only downloads what the landing/login
        // screens actually need. The heavy views are React.lazy()'d in App.tsx.
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-firebase': ['firebase/app', 'firebase/auth'],
              'vendor-charts': ['recharts'],
              'vendor-motion': ['motion/react'],
              'vendor-icons': ['lucide-react'],
            },
          },
        },
      }
    };
});
