import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: false },
  // (M1a cloth step 1, the cloth lane's smallest change: CALIMA_CLOTH=2 in Vite's environment serves the grid cloth on,
  //  src/entities/anim/cloth/rig.js clothMode; unset it is '' and nothing changes)
  define: { __CALIMA_CLOTH__: JSON.stringify(process.env.CALIMA_CLOTH || '') },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // One dependency cache per worktree: measuring and lane worktrees symlink node_modules from the integration tree,
  // and a shared node_modules/.vite made their boots fail on "504 Outdated Optimize Dep" when two trees re-optimized.
  cacheDir: '.vite-cache',
});
