import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vendor chunk buckets. First match wins; anything unmatched (app code, small
// shared helpers) is left to Rollup's own graph-based splitting, which is what
// pairs the route-level React.lazy imports in src/App.jsx with their own chunks.
//
// Only packages present in package.json / node_modules are named here:
//   react + react-router-dom -> react-vendor
//   recharts                -> charts-vendor
//   pdfjs-dist              -> pdfjs-vendor
//   jspdf (+ canvg)         -> jspdf-vendor
//   html2canvas             -> html2canvas-vendor
//   react-markdown          -> markdown-vendor
//   framer-motion           -> motion-vendor
//   lucide-react            -> icons-vendor
const VENDOR_CHUNKS = [
  // Rollup/Vite's own shared helpers (the dynamic-import preloader, the CJS interop
  // shim). These are a few hundred bytes; without a bucket of their own Rollup can
  // strand them inside a heavy vendor chunk, which then gets imported -- and
  // modulepreloaded -- by the entry chunk. That is how jsPDF once landed in the
  // first paint.
  ['vite-helpers', /\0(?:vite[\\/]preload-helper|commonjsHelpers)/],
  [
    'react-vendor',
    /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/,
  ],
  ['pdfjs-vendor', /[\\/]node_modules[\\/]pdfjs-dist[\\/]/],
  ['html2canvas-vendor', /[\\/]node_modules[\\/]html2canvas[\\/]/],
  ['jspdf-vendor', /[\\/]node_modules[\\/](jspdf|dompurify|fflate|canvg|rgbcolor)[\\/]/],
  [
    'charts-vendor',
    /[\\/]node_modules[\\/](recharts|recharts-scale|victory-vendor|react-smooth|internmap|d3-[a-z-]+|decimal\.js-light)[\\/]/,
  ],
  [
    'markdown-vendor',
    /[\\/]node_modules[\\/](react-markdown|remark-[a-z-]+|micromark[a-z-]*|mdast-[a-z-]+|unist-[a-z-]+|hast-[a-z-]+|unified|vfile[a-z-]*|bail|trough|devlop|ccount|markdown-table|zwitch|longest-streak|decode-named-character-reference|character-entities[a-z-]*|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|style-to-object|trim-lines|estree-[a-z-]+)[\\/]/,
  ],
  ['motion-vendor', /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/],
  ['icons-vendor', /[\\/]node_modules[\\/]lucide-react[\\/]/],
]

const manualChunks = (id) => {
  for (const [name, pattern] of VENDOR_CHUNKS) {
    if (pattern.test(id)) return name
  }
  return undefined
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    // Bundle budget from the completion spec: no chunk above 700 kB raw except
    // the intentionally isolated vendor chunks above.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
})
