import { defineConfig } from 'vite';

// The built site is served by the Worker at the root of the custom domain, so `base` is `/`.
// `BASE_PATH` remains as an escape hatch for serving under a path prefix.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
