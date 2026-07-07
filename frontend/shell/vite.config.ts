import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        crm: process.env.VITE_CRM_REMOTE_URL
          ? `${process.env.VITE_CRM_REMOTE_URL}/assets/remoteEntry.js`
          : 'http://localhost:5174/assets/remoteEntry.js',
        tenantPortal: process.env.VITE_PORTAL_REMOTE_URL
          ? `${process.env.VITE_PORTAL_REMOTE_URL}/assets/remoteEntry.js`
          : 'http://localhost:5175/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
