import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/stores': path.resolve(__dirname, './src/stores'),
      '@/pages': path.resolve(__dirname, './src/pages'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          let lastWarn = 0;
          proxy.on('error', () => {
            const now = Date.now();
            if (now - lastWarn > 5000) {
              lastWarn = now;
              console.warn('\n\x1b[33m⚠️  [Take It Web Frontend] Backend API (http://localhost:3000) se connect nahi ho pa raha!\x1b[0m');
              console.warn('\x1b[36m👉 Solution:\x1b[0m Ek alag terminal me `cd packages\\api` aur `npm run dev` start karein.\n');
            }
          });
        },
      },
      '/sse': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/sse/, '/api/sse'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Route-level React.lazy in App.tsx already defers recharts + the table lib
    // into their route chunks (loaded only when that route opens). Forcing them
    // into GLOBAL manualChunks would re-hoist them into the entry's preload list,
    // so we ONLY split truly-shared framework code here.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand'],
        },
      },
    },
  },
});
