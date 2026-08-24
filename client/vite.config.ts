import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: process.env.VITE_SOCKET_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
});
