import { defineConfig } from 'vite';

export default defineConfig( {
	// relative asset paths so the build runs from any sub-path (GitHub Pages)
	base: './',
	build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
	worker: { format: 'es' },
	// no hot reload: several people (and headless test runs) share one checkout, and a reload in the
	// middle of a test run or a play session is worse than pressing F5
	server: { port: 5190, strictPort: false, host: '127.0.0.1', hmr: false },
} );
