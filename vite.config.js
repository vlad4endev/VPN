import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig(() => {
  // Проверяем наличие HTTPS сертификатов (опционально)
  const httpsEnabled =
    fs.existsSync('./certs/localhost.crt') &&
    fs.existsSync('./certs/localhost.key')

  const serverConfig = {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true, // порт фиксированный
    cors: true, // открываем CORS
    https: httpsEnabled
      ? {
          key: fs.readFileSync('./certs/localhost.key'),
          cert: fs.readFileSync('./certs/localhost.crt')
        }
      : false,
    
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'skypath.fun',
      'www.skypath.fun',
      'admin.skypath.fun',
    ],

    proxy: {
      // Важно: более специфичные пути должны быть ПЕРЕД общим /api, иначе запросы
      // типа /api/xui/panel/... попадают на бэкенд 3001 и дают 404.
      // Прокси для 3x-ui панели (обновление клиента из админки и т.д.)
      '/api/xui': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('❌ XUI Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 XUI Proxy Request:', req.method, req.url, '→', 'http://localhost:3001' + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ XUI Proxy Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Прокси для Backend Proxy (VPN, client-stats, add-client и т.д.)
      '/api/vpn': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            console.error('❌ VPN Proxy error:', err.message);
            console.error('   Request:', req.method, req.url);
            if (!res.headersSent) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify({
                success: false,
                error: `Backend proxy недоступен: ${err.message}`,
                hint: 'Проверьте, что backend proxy запущен на http://localhost:3001'
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 VPN Proxy Request:', req.method, req.url, '→', 'http://localhost:3001' + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ VPN Proxy Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Прокси для платежей через n8n
      '/api/payment': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          return path
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('❌ Payment Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 Payment Proxy Request:', req.method, req.url, '→', 'http://localhost:3001' + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ Payment Proxy Response:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Общий прокси для остальных /api запросов (должен быть последним)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            console.error('❌ API Proxy error:', err.message);
            console.error('   Request:', req.method, req.url);
            if (!res.headersSent) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify({
                success: false,
                error: `Backend proxy недоступен: ${err.message}`,
                hint: 'Проверьте, что backend proxy запущен на http://localhost:3001'
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
            if (req.headers['x-app-id']) proxyReq.setHeader('X-App-Id', req.headers['x-app-id']);
            console.log('🔄 API Proxy Request:', req.method, req.url, '→', 'http://localhost:3001' + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ API Proxy Response:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  }

  return {
    optimizeDeps: {
      include: ['react', 'react-dom', '@tanstack/react-query'],
      // Убираем force: true — оставление может давать два экземпляра React при предбандлинге
      force: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@features': path.resolve(__dirname, './src/features'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@app': path.resolve(__dirname, './src/app'),
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        'firebase/firestore': path.resolve(__dirname, './src/lib/firebase/firestore-compat.js'),
        'firebase/auth': path.resolve(__dirname, './src/lib/firebase/auth-compat.js'),
        'firebase/database': path.resolve(__dirname, './src/lib/firebase/database-compat.js'),
        'firebase/app-check': path.resolve(__dirname, './src/lib/firebase/config.js'),
        'firebase/app': path.resolve(__dirname, './src/lib/firebase/config.js'),
      },
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      react(),
    ],
    server: serverConfig,
    build: {
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          manualChunks(id) {
            // React не выносим в отдельный chunk — оставляем в entry bundle (избегаем circular chunk и двух копий React)
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return undefined
              }
              if (id.includes('supabase')) {
                return 'supabase'
              }
              return 'vendor'
            }
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
  }
})
