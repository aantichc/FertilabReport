import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { app: 'index.html', teamsAuth: 'teams-auth.html' } } },
});
