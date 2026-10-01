import { defineConfig } from 'vite';

// cross-origin isolation: the page may use SharedArrayBuffer, and the baked terrain (46 MB) is shared with the
// world workers instead of copied into each (world/HeightField.js). Deployments that can't send these headers
// still work, with a copy per worker. (credentialless: the Google Fonts requests need no CORP header)
const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };

export default defineConfig( {
	// relative asset paths so the build runs from any sub-path (GitHub Pages)
	base: './',
	build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
	worker: { format: 'es' },
	// no hot reload: several people (and headless test runs) share one checkout, and a reload in the
	// middle of a test run or a play session is worse than pressing F5
	server: { port: 5190, strictPort: false, host: '127.0.0.1', hmr: false, headers: ISOLATION },
	preview: { headers: ISOLATION },
} );
