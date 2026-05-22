import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // @react-pdf/renderer is intentionally large (~1.4 MB minified) and already
    // lazy-loaded, so it doesn't affect initial page load. Raise the threshold
    // to avoid a spurious warning for that chunk.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
          // Recharts + its d3 tree into one vendor chunk
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor')) return 'vendor-charts';
        },
      },
    },
  },
})
