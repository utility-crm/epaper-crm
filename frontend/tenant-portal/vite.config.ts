import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'tenantPortal',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    modulePreload: false,
    // Windows 7 tops out at Chrome 109 / Firefox ~115 (many newspaper offices
    // still run it). Down-level newer syntax to what those parse. Method-level
    // APIs newer than this floor are shimmed at runtime in src/lib/polyfills.ts.
    target: ['chrome109', 'firefox115'],
    minify: false,
    cssCodeSplit: false,
  },
});
