import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/hokm-frontend/', // حتماً این رو اضافه کن
  plugins: [react()],
})