import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  // VITE_* is ours; NEXT_PUBLIC_* lets the build read the public Supabase URL
  // and key that Vercel's Supabase integration adds. Never add "SUPABASE_"
  // here: that would also expose SUPABASE_SERVICE_ROLE_KEY to the browser.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
})