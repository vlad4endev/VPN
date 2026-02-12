import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import http from 'http'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения
  const env = loadEnv(mode, process.cwd(), '')
  
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
      // Общий прокси для всех /api запросов
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
      // Прокси для Backend Proxy (новый)
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
      // Прокси для прямого подключения к 3x-ui (старый, для обратной совместимости)
      '/api/xui': {
        target: env.XUI_HOST || 'http://localhost:2053',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => {
          let apiPath = path.replace(/^\/api\/xui/, '')
          if (!apiPath.startsWith('/')) {
            apiPath = '/' + apiPath
          }
          const targetUrl = env.XUI_HOST || 'http://localhost:2053'
          try {
            const url = new URL(targetUrl)
            const panelPath = url.pathname
            const cleanPanelPath = panelPath.endsWith('/') ? panelPath.slice(0, -1) : panelPath
            return cleanPanelPath + apiPath
          } catch {
            return apiPath
          }
        },
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('❌ Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            const targetUrl = env.XUI_HOST || 'http://localhost:2053'
            console.log('🔄 Proxy Request:', req.method, req.url, '→', targetUrl);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ Proxy Response:', proxyRes.statusCode, req.url);
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
        // Один экземпляр React на всё приложение — устраняет "Invalid hook call" в AdminProvider
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      react(),
      // Плагин для обработки запросов тестирования сессии через прокси
      {
        name: 'test-session-proxy',
        configureServer(server) {
          server.middlewares.use('/api/test-session', async (req, res, next) => {
            // Обработка CORS preflight запросов
            if (req.method === 'OPTIONS') {
              res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              })
              res.end()
              return
            }
            
            // Только для POST запросов
            if (req.method !== 'POST') {
              return next()
            }
            
            try {
              // Читаем body запроса
              let body = ''
              req.on('data', chunk => {
                body += chunk.toString()
              })
              
              req.on('end', async () => {
                try {
                  if (!body) {
                    res.writeHead(400, { 
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                    })
                    res.end(JSON.stringify({ success: false, msg: 'Тело запроса пусто' }))
                    return
                  }
                  
                  const requestData = JSON.parse(body)
                  const { serverIP, serverPort, protocol, randompath, username, password } = requestData
                  
                  if (!serverIP || !serverPort) {
                    res.writeHead(400, { 
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                    })
                    res.end(JSON.stringify({ success: false, msg: 'serverIP и serverPort обязательны' }))
                    return
                  }
                  
                  // Формируем целевой URL
                  const normalizedPath = randompath 
                    ? `/${randompath.replace(/^\/+|\/+$/g, '')}`
                    : ''
                  const baseUrl = `${protocol || 'http'}://${serverIP}:${serverPort}${normalizedPath}`.replace(/\/+$/, '')
                  const fullUrl = `${baseUrl}/login`
                  
                  console.log('🔄 Test Session Proxy:', req.method, '→', fullUrl)
                  
                  // Очищаем username от кавычек перед отправкой
                  const cleanUsername = (username || '').trim().replace(/^["']|["']$/g, '')
                  
                  const requestBody = JSON.stringify({
                    username: cleanUsername,
                    password: password || '',
                  })
                  
                  console.log('📤 Sending request to:', fullUrl)
                  
                  // Используем встроенные модули http/https для более надежной работы
                  const response = await new Promise((resolve, reject) => {
                    const urlObj = new URL(fullUrl)
                    const requestModule = protocol === 'https' ? https : http
                    
                    const options = {
                      hostname: urlObj.hostname,
                      port: urlObj.port,
                      path: urlObj.pathname + urlObj.search,
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Content-Length': Buffer.byteLength(requestBody),
                      },
                    }
                    
                    // Для HTTPS с самоподписанными сертификатами отключаем проверку
                    if (protocol === 'https') {
                      options.rejectUnauthorized = false
                    }
                    
                    const req = requestModule.request(options, (res) => {
                      let responseData = ''
                      
                      res.on('data', (chunk) => {
                        responseData += chunk.toString()
                      })
                      
                      res.on('end', () => {
                        resolve({
                          status: res.statusCode,
                          statusText: res.statusMessage,
                          ok: res.statusCode >= 200 && res.statusCode < 300,
                          headers: res.headers,
                          text: async () => responseData,
                          json: async () => {
                            try {
                              return JSON.parse(responseData)
                            } catch (e) {
                              throw new Error(`Failed to parse JSON: ${e.message}`)
                            }
                          },
                        })
                      })
                    })
                    
                    req.on('error', (error) => {
                      reject(error)
                    })
                    
                    req.write(requestBody)
                    req.end()
                  })
                  
                  // Получаем текст ответа
                  const responseText = await response.text()
                  
                  console.log('📥 Response status:', response.status)
                  
                  // Парсим ответ
                  let responseData
                  try {
                    responseData = responseText ? JSON.parse(responseText) : {}
                  } catch (parseError) {
                    console.error('❌ Parse error:', parseError)
                    res.writeHead(500, { 
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                    })
                    res.end(JSON.stringify({ 
                      success: false, 
                      msg: `Ошибка парсинга ответа: ${parseError.message}`,
                    }))
                    return
                  }
                  
                  // Пробрасываем cookies из ответа 3x-ui
                  const setCookieHeader = response.headers['set-cookie'] || response.headers['Set-Cookie']
                  const responseHeaders = {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Credentials': 'true',
                  }
                  
                  if (setCookieHeader) {
                    const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
                    responseHeaders['Set-Cookie'] = cookieArray
                    console.log('🍪 Пробрасываем cookies в браузер:', cookieArray.length, 'cookie(s)')
                  }
                  
                  // Передаем ответ клиенту
                  res.writeHead(response.status, responseHeaders)
                  res.end(JSON.stringify(responseData))
                  
                  console.log('✅ Test Session Proxy Response:', response.status, fullUrl, 'success:', responseData.success)
                } catch (fetchError) {
                  console.error('❌ Fetch error:', fetchError)
                  res.writeHead(500, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                  })
                  res.end(JSON.stringify({ 
                    success: false, 
                    msg: `Ошибка подключения: ${fetchError.message || 'Не удалось подключиться к серверу'}`,
                  }))
                  return
                }
              })
            } catch (err) {
              console.error('❌ Test Session Proxy error:', err)
              res.writeHead(500, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(JSON.stringify({ success: false, msg: err.message || 'Ошибка прокси' }))
            }
          })
        },
      },
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
              if (id.includes('firebase')) {
                return 'firebase'
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
