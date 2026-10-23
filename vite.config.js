import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createEgoHandler } from './server/egoBridge.js';

// Local dev/preview only. Production uses `npm run start:browser` + an authenticated proxy.
function egoBrowserBridgePlugin() {
  const handler = createEgoHandler();
  return {
    name: 'ego-browser-bridge',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [react(), egoBrowserBridgePlugin()],
});
