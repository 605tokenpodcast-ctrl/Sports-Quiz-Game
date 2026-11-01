import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The AI voice runs in a worker that loads its model code in pieces, which needs ES workers.
export default defineConfig({ plugins: [react()], base: './', worker: { format: 'es' } });
