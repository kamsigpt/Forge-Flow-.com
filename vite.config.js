import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        signup: resolve(__dirname, 'signup.html'),
        login: resolve(__dirname, 'login.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
