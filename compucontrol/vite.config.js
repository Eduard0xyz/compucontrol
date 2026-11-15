import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Genera un solo index.html (sirve para Vercel y para abrirlo directo)
export default defineConfig({
  plugins: [react(), viteSingleFile()],
})
