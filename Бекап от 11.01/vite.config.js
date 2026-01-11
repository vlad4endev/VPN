import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https'
import http from 'http'
import path from 'path'

// Для анализатора бандла (опционально):
// npm install --save-dev rollup-plugin-visualizer
// import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@features': path.resolve(__dirname, './src/features'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@app': path.resolve(__dirname, './src/app'),
      }
    },
    plugins: [
      react(),
      // Анализатор бандла (раскомментируйте после установки rollup-plugin-visualizer)
      // visualizer({
      //   open: true, // Автоматически открыть отчет после сборки
      //   filename: 'dist/stats.html', // Файл с отчетом
      //   gzipSize: true, // Показать размер после gzip
      //   brotliSize: true, // Показать размер после brotli
      // }),
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
                  // Пример рабочего URL: https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw/login
                  // randompath: /Gxckr4KcZGtB6aOZdw/ -> должно стать /Gxckr4KcZGtB6aOZdw
                  const normalizedPath = randompath 
                    ? `/${randompath.replace(/^\/+|\/+$/g, '')}` // Убираем начальные и конечные слэши, добавляем один в начале
                    : ''
                  // Формируем base URL: protocol://serverIP:serverPort/path (без завершающего слэша)
                  const baseUrl = `${protocol || 'http'}://${serverIP}:${serverPort}${normalizedPath}`.replace(/\/+$/, '')
                  // Добавляем /login в конец
                  const fullUrl = `${baseUrl}/login`
                  
                  console.log('🔄 Test Session Proxy:', req.method, '→', fullUrl)
                  console.log('📋 Request params:', { 
                    serverIP, 
                    serverPort, 
                    protocol, 
                    randompath,
                    normalizedPath,
                    baseUrl,
                    fullUrl,
                    hasUsername: !!username, 
                    hasPassword: !!password 
                  })
                  console.log('📋 Request body:', { username, password: password ? '***' : '' })
                  
                  // Проверяем доступность fetch (Node.js 18+)
                  if (typeof fetch === 'undefined') {
                    throw new Error('fetch недоступен. Требуется Node.js 18+ или установите node-fetch')
                  }
                  
                  // Делаем запрос к целевому серверу
                  // КРИТИЧНО: Очищаем username от кавычек перед отправкой
                  // Это предотвращает проблемы, если кавычки попали в данные
                  const cleanUsername = (username || '').trim().replace(/^["']|["']$/g, '')
                  
                  // Используем встроенные модули http/https для надежной работы с HTTPS
                  const requestBody = JSON.stringify({
                    username: cleanUsername,
                    password: password || '',
                  })
                  
                  console.log('📤 Sending request to:', fullUrl)
                  console.log('📤 Request body (password hidden):', requestBody.replace(/"(password)":"[^"]*"/, '"$1":"***"')) // Скрываем пароль в логах
                  console.log('📤 Username (original):', username)
                  console.log('📤 Username (cleaned):', cleanUsername)
                  console.log('📤 Username length:', cleanUsername ? cleanUsername.length : 0)
                  console.log('📤 Password length:', password ? password.length : 0)
                  console.log('📤 Password contains %:', password ? password.includes('%') : false)
                  console.log('📤 Password contains special chars:', password ? /[%&<>"']/.test(password) : false)
                  console.log('📤 Full request body (for debugging):', JSON.stringify({
                    username: username,
                    password: password ? `***(${password.length} chars)` : 'empty'
                  }))
                  
                  // ВАЖНО: Проверяем, что пароль правильно передается
                  try {
                    const parsedBody = JSON.parse(requestBody)
                    if (parsedBody.password !== password) {
                      console.error('⚠️ ПРОБЛЕМА: Пароль в requestBody не совпадает с переданным!')
                      console.error('   Ожидалось:', password ? `***(${password.length} chars)` : 'empty')
                      console.error('   Получено:', parsedBody.password ? `***(${parsedBody.password.length} chars)` : 'empty')
                    }
                  } catch (e) {
                    console.error('⚠️ Ошибка парсинга requestBody:', e.message)
                  }
                  
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
                    
                    // Для HTTPS с самоподписанными сертификатами отключаем проверку (только для разработки!)
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
                  console.log('📥 Response text:', responseText.substring(0, 500)) // Первые 500 символов для отладки
                  
                  // Парсим ответ
                  let responseData
                  try {
                    responseData = responseText ? JSON.parse(responseText) : {}
                  } catch (parseError) {
                    console.error('❌ Parse error:', parseError)
                    console.error('❌ Response text:', responseText)
                    res.writeHead(500, { 
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                    })
                    res.end(JSON.stringify({ 
                      success: false, 
                      msg: `Ошибка парсинга ответа: ${parseError.message}`,
                      responseText: responseText.substring(0, 200) // Первые 200 символов для отладки
                    }))
                    return
                  }
                  
                  // ВАЖНО: Пробрасываем cookies из ответа 3x-ui
                  // Извлекаем set-cookie заголовки из ответа сервера
                  const setCookieHeader = response.headers['set-cookie'] || response.headers['Set-Cookie']
                  const responseHeaders = {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Credentials': 'true',
                  }
                  
                  // Если есть cookies, пробрасываем их в браузер
                  if (setCookieHeader) {
                    // set-cookie может быть массивом или строкой
                    const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
                    responseHeaders['Set-Cookie'] = cookieArray
                    console.log('🍪 Пробрасываем cookies в браузер:', cookieArray.length, 'cookie(s)')
                    cookieArray.forEach((cookie, idx) => {
                      console.log(`   Cookie ${idx + 1}:`, cookie.substring(0, 50) + '...')
                    })
                  } else {
                    console.log('⚠️ Cookies не найдены в ответе сервера')
                  }
                  
                  // Передаем ответ клиенту как есть (даже если это ошибка авторизации)
                  // Сервер 3x-ui может возвращать статус 200 с success: false в теле ответа
                  res.writeHead(response.status, responseHeaders)
                  res.end(JSON.stringify(responseData))
                  
                  console.log('✅ Test Session Proxy Response:', response.status, fullUrl, 'success:', responseData.success)
                } catch (fetchError) {
                  console.error('❌ Fetch error:', fetchError)
                  console.error('❌ Fetch error details:', {
                    message: fetchError.message,
                    code: fetchError.code,
                    cause: fetchError.cause,
                    stack: fetchError.stack
                  })
                  res.writeHead(500, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                  })
                  res.end(JSON.stringify({ 
                    success: false, 
                    msg: `Ошибка подключения: ${fetchError.message || 'Не удалось подключиться к серверу'}`,
                    errorCode: fetchError.code,
                    details: fetchError.cause?.message || fetchError.toString()
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
    server: {
      proxy: {
        // Прокси для Backend Proxy (новый)
        '/api/vpn': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            // Проксируем как есть, без изменений пути
            return path
          },
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.error('❌ VPN Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('🔄 VPN Proxy Request:', req.method, req.url, '→', 'http://localhost:3001' + req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('✅ VPN Proxy Response:', proxyRes.statusCode, req.url);
            });
          },
        },
        // Прокси для прямого подключения к 3x-ui (старый, для обратной совместимости)
        '/api/xui': {
          target: env.XUI_HOST || 'http://localhost:2053',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            // Удаляем /api/xui из пути
            let apiPath = path.replace(/^\/api\/xui/, '')
            // Убеждаемся, что apiPath начинается с /
            if (!apiPath.startsWith('/')) {
              apiPath = '/' + apiPath
            }
            // Если XUI_HOST содержит путь к панели (например /Gxckr4KcZGtB6aOZdw), добавляем его
            const targetUrl = env.XUI_HOST || 'http://localhost:2053'
            try {
              const url = new URL(targetUrl)
              const panelPath = url.pathname
              // Убираем завершающий слэш, если есть
              const cleanPanelPath = panelPath.endsWith('/') ? panelPath.slice(0, -1) : panelPath
              // Склеиваем пути: cleanPanelPath уже не заканчивается на /, apiPath начинается с /
              // Результат будет без двойных слэшей
              return cleanPanelPath + apiPath
            } catch {
              // Если не валидный URL, просто возвращаем путь без /api/xui
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
    },
    build: {
      rollupOptions: {
        output: {
          // Настройка именования chunks для лучшей организации
          manualChunks: (id) => {
            // Группировка vendor библиотек
            if (id.includes('node_modules')) {
              // React и React DOM
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor'
              }
              // Firebase
              if (id.includes('firebase')) {
                return 'firebase-vendor'
              }
              // React Router
              if (id.includes('react-router')) {
                return 'router-vendor'
              }
              // UI библиотеки
              if (id.includes('lucide-react')) {
                return 'ui-vendor'
              }
              // Остальные vendor библиотеки
              return 'vendor'
            }
            // Группировка по features
            if (id.includes('/features/dashboard/')) {
              return 'dashboard'
            }
            if (id.includes('/features/admin/')) {
              return 'admin'
            }
            if (id.includes('/features/auth/')) {
              return 'auth'
            }
          },
          // Настройка имен файлов
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Оптимизация размера бандла
      chunkSizeWarningLimit: 1000, // Предупреждение при размере chunk > 1MB
    },
  }
})

