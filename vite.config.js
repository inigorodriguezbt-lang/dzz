import { defineConfig } from 'vite';

export default defineConfig( {
	// relative asset paths so the build runs from any sub-path (GitHub Pages)
	base: './',
	build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
	worker: { format: 'es' },
	server: { port: 5190, strictPort: true, host: '127.0.0.1' },
} );
