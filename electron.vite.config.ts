import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  // NOTE: zod must be bundled into the preload (not externalized): sandboxed
  // preloads can only require 'electron', so an external require('zod')
  // throws, the bridge never exposes window.api, and every window crashes
  // on its first IPC hook. Main keeps full externalization (plain Node).
  preload: { plugins: [externalizeDepsPlugin({ exclude: ['zod'] })], resolve: { alias } },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } },
  },
});
