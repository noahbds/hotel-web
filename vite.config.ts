import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(rootDir, '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: resolve(rootDir, 'node_modules/react'),
      'react-dom': resolve(rootDir, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(rootDir, 'node_modules/react/jsx-runtime.js'),
      supabase: resolve(rootDir, 'node_modules/@supabase/supabase-js/dist/index.mjs'),
      'lucide-react': resolve(rootDir, 'node_modules/lucide-react/dist/esm/lucide-react.mjs'),
    },
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
})
