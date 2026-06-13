/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig({
  plugins: [
    // React Compiler(自動メモ化)。plugin-react v6 は内部 Babel を持たないため
    // @rolldown/plugin-babel 経由で React プラグインより前に適用する
    babel({ presets: [reactCompilerPreset()] }),
    react(),
  ],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    proxy: {
      // ws:true で WebSocket(リアルタイムデータチャネル)もプロキシ
      '/api': { target: 'http://localhost:8787', ws: true },
      '/preview': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
