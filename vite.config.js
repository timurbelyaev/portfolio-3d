import { defineConfig } from 'vite'

// base './' keeps asset URLs relative so the static build works behind any
// path prefix (Railway static host, preview servers, subfolders).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
