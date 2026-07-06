import { defineConfig } from 'vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        about: resolve(rootDir, 'about.html'),
        apiReference: resolve(rootDir, 'api-reference.html'),
        app: resolve(rootDir, 'app.html'),
        contact: resolve(rootDir, 'contact.html'),
        documentation: resolve(rootDir, 'documentation.html'),
        help: resolve(rootDir, 'help.html'),
        login: resolve(rootDir, 'login.html'),
        payment: resolve(rootDir, 'payment.html'),
        pricingSelect: resolve(rootDir, 'pricing-select.html'),
        privacy: resolve(rootDir, 'privacy.html'),
        signup: resolve(rootDir, 'signup.html'),
        status: resolve(rootDir, 'status.html'),
        terms: resolve(rootDir, 'terms.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})
