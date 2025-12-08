import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        easter_egg: resolve(__dirname, 'easter_egg.html'),
      },
    },
  },
});
