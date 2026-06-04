import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/media': {
        target: 'http://127.0.0.1:18002',
        changeOrigin: true,
      },
      // 用户头像由 user 服务提供静态文件，dev 下代理到 user 服务 HTTP 端口
      '/avatars': {
        target: 'http://127.0.0.1:18001',
        changeOrigin: true,
      },
    },
  },
});
