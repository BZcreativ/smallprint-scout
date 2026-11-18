import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// A build without .env.local bakes `void 0` into the Firebase config; the
// deployed app then dies at startup with auth/invalid-api-key behind a blank
// page. Refuse to produce one.
const requireFirebaseEnv = (apiKey?: string): Plugin => ({
  name: 'require-firebase-env',
  apply: 'build',
  buildStart() {
    if (!apiKey) {
      this.error('VITE_FIREBASE_API_KEY is missing: copy .env.example to .env.local and fill it in before building.')
    }
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), requireFirebaseEnv(env.VITE_FIREBASE_API_KEY)],
  }
})
