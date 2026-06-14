import type { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';
import { emitAppCss, emitTokensCss } from './emit-css';
import { emitVueElement, emitVuePage } from './emit-vue';
import { emitVueDomain } from './emit-vue-domain';
import type { GeneratedFile } from './files';
import { screenStyleCss } from './screen-style';
import { collectComponents, toUiTree } from './ui-model';

/**
 * Vue 3 フレームワーク generator(FR-GEN-07)。中立 UI モデルから、ビルド可能な
 * Vue 3 アプリ一式(scaffolding + vue-router + ページ SFC + 共通 CSS)を生成する。
 * React generator(emit-project)と同じ ProjectDoc を入力にする2実装目。
 *
 * 対象は UI 層(画面 + ルーティング + モニタリング部品)。モニタリング部品は
 * mock データで動く Composition API の SFC を出力する(WS/Modbus 連携や
 * ドメイン層・状態管理の生成は将来。React 版が完全機能の本命)。
 */

const VUE_VERSIONS = {
  vue: '^3.5.13',
  vueRouter: '^4.5.0',
  pluginVue: '^5.2.1',
  vueTsc: '^2.2.0',
  typescript: '^5.7.3',
  vite: '^6.0.7',
} as const;

const file = (path: string, content: string): GeneratedFile => ({ path, content });

const toPackageName = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vue-app';

const packageJson = (projectName: string): string =>
  `${JSON.stringify(
    {
      name: toPackageName(projectName),
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vue-tsc --noEmit && vite build',
        preview: 'vite preview',
      },
      dependencies: { vue: VUE_VERSIONS.vue, 'vue-router': VUE_VERSIONS.vueRouter },
      devDependencies: {
        '@vitejs/plugin-vue': VUE_VERSIONS.pluginVue,
        typescript: VUE_VERSIONS.typescript,
        'vue-tsc': VUE_VERSIONS.vueTsc,
        vite: VUE_VERSIONS.vite,
      },
    },
    null,
    2,
  )}\n`;

const viteConfig = `// 自動生成 — AppForge(Vue framework generator)
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
});
`;

const tsconfig = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      jsx: 'preserve',
      isolatedModules: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['vite/client'],
    },
    include: ['src', 'env.d.ts'],
  },
  null,
  2,
)}\n`;

const envDts = `/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
`;

const indexHtml = (title: string): string => `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const mainTs = `// 自動生成 — AppForge(Vue)
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/tokens.css';
import './styles/app.css';

createApp(App).use(router).mount('#app');
`;

const routerTs = (doc: ProjectDoc, extraRoutes: ReadonlyArray<{ path: string; component: string }>): string => {
  const pageRoutes = doc.pages.map(
    (p, i) => `  { path: ${JSON.stringify(p.path)}, component: () => import('./pages/Page${i}.vue') },`,
  );
  const domainRoutes = extraRoutes.map(
    (r) => `  { path: ${JSON.stringify(r.path)}, component: () => import(${JSON.stringify(r.component)}) },`,
  );
  return `// 自動生成 — AppForge(Vue Router、ハッシュ履歴でサブパス配信に対応)
import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
${[...pageRoutes, ...domainRoutes].join('\n')}
  ],
});
`;
};

/** App.vue: 共通ヘッダー/フッター + <router-view/> */
const appVue = (doc: ProjectDoc): string => {
  const header = doc.layout.header ? emitVueElement(toUiTree(doc.layout.header), 2).join('\n') : '';
  const footer = doc.layout.footer ? emitVueElement(toUiTree(doc.layout.footer), 2).join('\n') : '';
  return `<!-- 自動生成 — AppForge(Vue) -->
<template>
  <div class="app-root">
${header}
    <main class="page-main">
      <router-view />
    </main>
${footer}
  </div>
</template>
`;
};

// ---------- モニタリング部品(mock データで動く Vue SFC)----------

const useChannelTs = `// 自動生成 — AppForge(Vue): データチャネル(PoC は mock のみ)
import { onUnmounted, ref, type Ref } from 'vue';

export function useChannel(min: number, max: number, interval: number): Ref<number | null> {
  const value = ref<number | null>(null);
  const tick = () => { value.value = min + Math.random() * (max - min); };
  tick();
  const id = setInterval(tick, Math.max(200, interval));
  onUnmounted(() => clearInterval(id));
  return value;
}

export type Severity = 'normal' | 'warn' | 'crit';
export function severityOf(
  v: number,
  t: { warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number },
): Severity {
  if ((t.critAbove != null && v >= t.critAbove) || (t.critBelow != null && v <= t.critBelow)) return 'crit';
  if ((t.warnAbove != null && v >= t.warnAbove) || (t.warnBelow != null && v <= t.warnBelow)) return 'warn';
  return 'normal';
}
`;

const metricVue = `<!-- 自動生成 — AppForge(Vue): 数値カード -->
<script setup lang="ts">
import { computed } from 'vue';
import { useChannel, severityOf } from './useChannel';
const props = defineProps<{
  label: string; unit?: string; min: number; max: number; interval: number; decimals?: number;
  warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number;
}>();
const value = useChannel(props.min, props.max, props.interval);
const severity = computed(() => (value.value === null ? 'normal' : severityOf(value.value, props)));
</script>
<template>
  <div :class="['c-metric', severity !== 'normal' ? 's-' + severity : '']">
    <span class="c-metric-label">{{ label }}</span>
    <span class="c-metric-value">
      {{ value === null ? '—' : value.toFixed(decimals ?? 0) }}<span class="c-metric-unit">{{ unit }}</span>
    </span>
  </div>
</template>
`;

const gaugeVue = `<!-- 自動生成 — AppForge(Vue): ゲージ -->
<script setup lang="ts">
import { computed } from 'vue';
import { useChannel, severityOf } from './useChannel';
const props = defineProps<{
  label: string; unit?: string; min: number; max: number; interval: number; decimals?: number;
  warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number;
}>();
const value = useChannel(props.min, props.max, props.interval);
const severity = computed(() => (value.value === null ? 'normal' : severityOf(value.value, props)));
const ratio = computed(() =>
  value.value === null || props.max <= props.min
    ? 0
    : Math.min(1, Math.max(0, (value.value - props.min) / (props.max - props.min))),
);
</script>
<template>
  <div :class="['c-gauge', severity !== 'normal' ? 's-' + severity : '']">
    <div class="c-gauge-head">
      <span class="c-gauge-label">{{ label }}</span>
      <span class="c-gauge-value">{{ value === null ? '—' : value.toFixed(decimals ?? 1) }}{{ unit }}</span>
    </div>
    <div class="c-gauge-track">
      <div class="c-gauge-fill" :style="{ width: (ratio * 100).toFixed(1) + '%' }" />
    </div>
  </div>
</template>
`;

const lampVue = `<!-- 自動生成 — AppForge(Vue): ステータスランプ -->
<script setup lang="ts">
import { computed } from 'vue';
import { useChannel, severityOf } from './useChannel';
const props = defineProps<{
  label: string; min: number; max: number; interval: number;
  warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number;
}>();
const value = useChannel(props.min, props.max, props.interval);
const severity = computed(() => (value.value === null ? 'normal' : severityOf(value.value, props)));
</script>
<template>
  <div class="c-lamp">
    <span :class="'c-lamp-dot s-' + severity" />
    <span class="c-lamp-label">{{ label }}</span>
    <span class="c-lamp-value">{{ value === null ? '—' : value.toFixed(0) }}</span>
  </div>
</template>
`;

const chartVue = `<!-- 自動生成 — AppForge(Vue): スパークラインチャート -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useChannel, severityOf } from './useChannel';
const props = defineProps<{
  label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number;
  warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number;
}>();
const value = useChannel(props.min, props.max, props.interval);
const series = ref<number[]>([]);
watch(value, (v) => {
  if (v === null) return;
  const cap = Math.max(2, props.capacity ?? 40);
  const next = series.value.concat(v);
  series.value = next.length > cap ? next.slice(next.length - cap) : next;
});
const severity = computed(() => (value.value === null ? 'normal' : severityOf(value.value, props)));
const W = 240;
const H = 56;
const points = computed(() =>
  series.value
    .map((v, i) => {
      const x = series.value.length <= 1 ? 0 : (i / (series.value.length - 1)) * W;
      const r = props.max <= props.min ? 0 : Math.min(1, Math.max(0, (v - props.min) / (props.max - props.min)));
      return x.toFixed(1) + ',' + (H - r * H).toFixed(1);
    })
    .join(' '),
);
</script>
<template>
  <div :class="['c-chart', severity !== 'normal' ? 's-' + severity : '']">
    <div class="c-chart-head">
      <span class="c-chart-label">{{ label }}</span>
      <span class="c-chart-value">{{ value === null ? '—' : value.toFixed(decimals ?? 1) }}{{ unit }}</span>
    </div>
    <svg class="c-chart-svg" :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="none">
      <polyline v-if="series.length > 1" class="c-chart-line" :points="points" fill="none" />
    </svg>
  </div>
</template>
`;

const setpointVue = `<!-- 自動生成 — AppForge(Vue): 設定値の書き込み(PoC は表示のみ) -->
<script setup lang="ts">
import { ref } from 'vue';
const props = defineProps<{ label: string; unit?: string; value: number; writeLabel: string; confirmMessage: string }>();
const current = ref<number>(props.value);
const status = ref<string>('');
const submit = () => {
  if (!window.confirm(props.confirmMessage)) return;
  // PoC: Vue 版は表示のみ(実書き込みは React 版 / BE write エンドポイント)
  status.value = '送信(PoC)';
};
</script>
<template>
  <div class="c-setpoint">
    <span class="c-setpoint-label">{{ label }}</span>
    <div class="c-setpoint-row">
      <input class="c-setpoint-input" type="number" v-model.number="current" />
      <span class="c-setpoint-unit">{{ unit }}</span>
      <button class="c-setpoint-btn" type="button" @click="submit">{{ writeLabel }}</button>
    </div>
    <span v-if="status" class="c-setpoint-status">{{ status }}</span>
  </div>
</template>
`;

const REALTIME_VUE: Record<string, string> = {
  Metric: metricVue,
  Gauge: gaugeVue,
  Lamp: lampVue,
  Chart: chartVue,
  Setpoint: setpointVue,
};

/** ドキュメント全体で使われている UI 部品名を集める */
const usedComponents = (doc: ProjectDoc): Set<string> => {
  const all = new Set<string>();
  const collect = (n: ComponentNode | null) => {
    if (n) collectComponents(toUiTree(n), all);
  };
  doc.pages.forEach((p) => collect(p.root));
  doc.dialogs.forEach((d) => collect(d.root));
  collect(doc.layout.header);
  collect(doc.layout.footer);
  return all;
};

/** ProjectDoc → ビルド可能な Vue 3 アプリ一式 */
export const generateVueProject = (doc: ProjectDoc, projectName: string): GeneratedFile[] => {
  // 集約があればドメイン層(型 + 検証 + シード mock repository)+ 一覧ページを生成
  const domain = emitVueDomain(doc.dataModel);
  const files: GeneratedFile[] = [
    file('package.json', packageJson(projectName)),
    file('vite.config.ts', viteConfig),
    file('tsconfig.json', tsconfig),
    file('env.d.ts', envDts),
    file('index.html', indexHtml(projectName)),
    file('src/main.ts', mainTs),
    file('src/App.vue', appVue(doc)),
    file('src/router.ts', routerTs(doc, domain.routes)),
    // Vue PoC は tailwind プラグインを配線しないため css-variables 固定(依存ゼロ)
    file('src/styles/tokens.css', emitTokensCss(doc.tokens, 'css-variables')),
    file('src/styles/app.css', emitAppCss()),
    ...doc.pages.map((page, i) =>
      file(
        `src/pages/Page${i}.vue`,
        emitVuePage(page.root, `Page${i}`, '../shared/realtime', screenStyleCss(page.screen)),
      ),
    ),
    ...domain.files,
  ];

  // 使われている UI 部品の Vue SFC + 共通 composable を出力
  const used = usedComponents(doc);
  const realtimeUsed = [...used].filter((c) => c in REALTIME_VUE);
  if (realtimeUsed.length > 0) {
    files.push(file('src/shared/realtime/useChannel.ts', useChannelTs));
    for (const name of realtimeUsed) {
      files.push(file(`src/shared/realtime/${name}.vue`, REALTIME_VUE[name]!));
    }
  }
  return files;
};
