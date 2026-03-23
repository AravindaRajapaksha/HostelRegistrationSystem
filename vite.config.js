import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function registerIotLogProxy(middlewares) {
  middlewares.use('/api/iot-log', async (req, res) => {
    const origin = `http://${req.headers.host}`
    const requestUrl = new URL(req.url ?? '', origin)
    const targetUrl = requestUrl.searchParams.get('url')

    if (!targetUrl) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Missing IoT log URL.')
      return
    }

    try {
      const response = await fetch(targetUrl)

      if (!response.ok) {
        res.statusCode = response.status
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('IoT log request failed.')
        return
      }

      const text = await response.text()
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(text)
    } catch {
      res.statusCode = 502
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('Could not reach the IoT log URL.')
    }
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'iot-log-proxy',
      configureServer(server) {
        registerIotLogProxy(server.middlewares)
      },
      configurePreviewServer(server) {
        registerIotLogProxy(server.middlewares)
      },
    },
  ],
})
