import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      //http routes
      '/api': 'http://localhost:3001',
      //websocket route
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
