import type { ComponentNode } from '@/domain/component-node';
import type { ProjectDoc } from '@/domain/project-doc';
import { emitAppCss, emitTokensCss } from './emit-css';
import { emitSvelteElement, emitSveltePage } from './emit-svelte';
import { emitSvelteDomain, type SvelteDomainRoute } from './emit-svelte-domain';
import type { GeneratedFile } from './files';
import { collectComponents, toUiTree } from './ui-model';

/**
 * Svelte 5 フレームワーク generator(FR-GEN-07)。中立 UI モデルから、ビルド可能な
 * Svelte 5 + Vite アプリ(scaffolding + svelte-spa-router + ページ + 共通 CSS)を生成する。
 * 対象は UI 層(画面 + ルーティング + モニタリング mock)。
 */

const V = {
  svelte: '^5.16.0',
  pluginSvelte: '^5.0.3',
  svelteCheck: '^4.1.4',
  spaRouter: '^4.0.1',
  typescript: '^5.7.3',
  vite: '^6.0.7',
} as const;

const file = (path: string, content: string): GeneratedFile => ({ path, content });

const toPackageName = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'svelte-app';

const packageJson = (projectName: string): string =>
  `${JSON.stringify(
    {
      name: toPackageName(projectName),
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'svelte-check --tsconfig ./tsconfig.json && vite build',
        preview: 'vite preview',
      },
      dependencies: { 'svelte-spa-router': V.spaRouter },
      devDependencies: {
        '@sveltejs/vite-plugin-svelte': V.pluginSvelte,
        svelte: V.svelte,
        'svelte-check': V.svelteCheck,
        typescript: V.typescript,
        vite: V.vite,
      },
    },
    null,
    2,
  )}\n`;

const viteConfig = `// 自動生成 — AppForge(Svelte framework generator)
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
});
`;

const svelteConfig = `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
`;

const tsconfig = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      types: ['svelte', 'vite/client'],
    },
    include: ['src/**/*.ts', 'src/**/*.svelte'],
  },
  null,
  2,
)}\n`;

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

const mainTs = `// 自動生成 — AppForge(Svelte 5)
import { mount } from 'svelte';
import App from './App.svelte';
import './styles/tokens.css';
import './styles/app.css';

mount(App, { target: document.getElementById('app')! });
`;

/** App.svelte: 共通ヘッダー/フッター + svelte-spa-router の <Router /> */
const appSvelte = (doc: ProjectDoc, extraRoutes: ReadonlyArray<SvelteDomainRoute>): string => {
  const pageImports = doc.pages.map((_, i) => `  import Page${i} from './pages/Page${i}.svelte';`);
  const domainImports = extraRoutes.map((r) => `  import ${r.importName} from ${JSON.stringify(r.importPath)};`);
  const pageEntries = doc.pages.map((p, i) => `    ${JSON.stringify(p.path)}: Page${i},`);
  const domainEntries = extraRoutes.map((r) => `    ${JSON.stringify(r.path)}: ${r.importName},`);
  const header = doc.layout.header ? emitSvelteElement(toUiTree(doc.layout.header), 1).join('\n') : '';
  const footer = doc.layout.footer ? emitSvelteElement(toUiTree(doc.layout.footer), 1).join('\n') : '';
  return `<!-- 自動生成 — AppForge(Svelte 5) -->
<script lang="ts">
  import Router from 'svelte-spa-router';
${[...pageImports, ...domainImports].join('\n')}
  const routes = {
${[...pageEntries, ...domainEntries].join('\n')}
  };
</script>

<div class="app-root">
${header}
  <main class="page-main">
    <Router {routes} />
  </main>
${footer}
</div>
`;
};

// ---------- モニタリング部品(Svelte 5 runes、mock データ)----------

const severityTs = `// 自動生成 — AppForge(Svelte): しきい値の重大度
export type Severity = 'normal' | 'warn' | 'crit';
export type Thresholds = { warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number };

export function severityOf(v: number | null, t: Thresholds): Severity {
  if (v === null) return 'normal';
  if ((t.critAbove != null && v >= t.critAbove) || (t.critBelow != null && v <= t.critBelow)) return 'crit';
  if ((t.warnAbove != null && v >= t.warnAbove) || (t.warnBelow != null && v <= t.warnBelow)) return 'warn';
  return 'normal';
}
`;

const metricSvelte = `<!-- 自動生成 — AppForge(Svelte): 数値カード -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { severityOf } from './severity';
  type Props = {
    label: string; unit?: string; min: number; max: number; interval: number; decimals?: number;
    warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number; [k: string]: unknown;
  };
  let { label, unit = '', min, max, interval, decimals = 0, warnAbove, critAbove, warnBelow, critBelow }: Props = $props();
  let value = $state<number | null>(null);
  onMount(() => {
    const tick = () => { value = min + Math.random() * (max - min); };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  });
  const sev = $derived(severityOf(value, { warnAbove, critAbove, warnBelow, critBelow }));
</script>

<div class="c-metric {sev !== 'normal' ? 's-' + sev : ''}">
  <span class="c-metric-label">{label}</span>
  <span class="c-metric-value">{value === null ? '—' : value.toFixed(decimals)}<span class="c-metric-unit">{unit}</span></span>
</div>
`;

const gaugeSvelte = `<!-- 自動生成 — AppForge(Svelte): ゲージ -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { severityOf } from './severity';
  type Props = {
    label: string; unit?: string; min: number; max: number; interval: number; decimals?: number;
    warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number; [k: string]: unknown;
  };
  let { label, unit = '', min, max, interval, decimals = 1, warnAbove, critAbove, warnBelow, critBelow }: Props = $props();
  let value = $state<number | null>(null);
  onMount(() => {
    const tick = () => { value = min + Math.random() * (max - min); };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  });
  const sev = $derived(severityOf(value, { warnAbove, critAbove, warnBelow, critBelow }));
  const ratio = $derived(value === null || max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min))));
</script>

<div class="c-gauge {sev !== 'normal' ? 's-' + sev : ''}">
  <div class="c-gauge-head">
    <span class="c-gauge-label">{label}</span>
    <span class="c-gauge-value">{value === null ? '—' : value.toFixed(decimals)}{unit}</span>
  </div>
  <div class="c-gauge-track">
    <div class="c-gauge-fill" style="width: {(ratio * 100).toFixed(1)}%"></div>
  </div>
</div>
`;

const lampSvelte = `<!-- 自動生成 — AppForge(Svelte): ステータスランプ -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { severityOf } from './severity';
  type Props = {
    label: string; min: number; max: number; interval: number;
    warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number; [k: string]: unknown;
  };
  let { label, min, max, interval, warnAbove, critAbove, warnBelow, critBelow }: Props = $props();
  let value = $state<number | null>(null);
  onMount(() => {
    const tick = () => { value = min + Math.random() * (max - min); };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  });
  const sev = $derived(severityOf(value, { warnAbove, critAbove, warnBelow, critBelow }));
</script>

<div class="c-lamp">
  <span class="c-lamp-dot s-{sev}"></span>
  <span class="c-lamp-label">{label}</span>
  <span class="c-lamp-value">{value === null ? '—' : value.toFixed(0)}</span>
</div>
`;

const chartSvelte = `<!-- 自動生成 — AppForge(Svelte): スパークラインチャート -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { severityOf } from './severity';
  type Props = {
    label: string; unit?: string; min: number; max: number; interval: number; decimals?: number; capacity?: number;
    warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number; [k: string]: unknown;
  };
  let { label, unit = '', min, max, interval, decimals = 1, capacity = 40, warnAbove, critAbove, warnBelow, critBelow }: Props = $props();
  let series = $state<number[]>([]);
  const W = 240;
  const H = 56;
  onMount(() => {
    const cap = Math.max(2, capacity);
    const tick = () => {
      const v = min + Math.random() * (max - min);
      const next = series.concat(v);
      series = next.length > cap ? next.slice(next.length - cap) : next;
    };
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  });
  const value = $derived(series.length > 0 ? series[series.length - 1] : null);
  const sev = $derived(severityOf(value ?? null, { warnAbove, critAbove, warnBelow, critBelow }));
  const points = $derived(
    series
      .map((v, i) => {
        const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * W;
        const r = max <= min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
        return x.toFixed(1) + ',' + (H - r * H).toFixed(1);
      })
      .join(' '),
  );
</script>

<div class="c-chart {sev !== 'normal' ? 's-' + sev : ''}">
  <div class="c-chart-head">
    <span class="c-chart-label">{label}</span>
    <span class="c-chart-value">{value === undefined || value === null ? '—' : value.toFixed(decimals)}{unit}</span>
  </div>
  <svg class="c-chart-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">
    {#if series.length > 1}<polyline class="c-chart-line" points={points} fill="none" />{/if}
  </svg>
</div>
`;

const setpointSvelte = `<!-- 自動生成 — AppForge(Svelte): 設定値の書き込み(PoC は表示のみ) -->
<script lang="ts">
  type Props = { label: string; unit?: string; value: number; writeLabel: string; confirmMessage: string; [k: string]: unknown };
  let { label, unit = '', value, writeLabel, confirmMessage }: Props = $props();
  let current = $state<number>(value);
  let status = $state<string>('');
  function submit() {
    if (!window.confirm(confirmMessage)) return;
    status = '送信(PoC)';
  }
</script>

<div class="c-setpoint">
  <span class="c-setpoint-label">{label}</span>
  <div class="c-setpoint-row">
    <input class="c-setpoint-input" type="number" bind:value={current} />
    <span class="c-setpoint-unit">{unit}</span>
    <button class="c-setpoint-btn" type="button" onclick={submit}>{writeLabel}</button>
  </div>
  {#if status}<span class="c-setpoint-status">{status}</span>{/if}
</div>
`;

const REALTIME_SVELTE: Record<string, string> = {
  Metric: metricSvelte,
  Gauge: gaugeSvelte,
  Lamp: lampSvelte,
  Chart: chartSvelte,
  Setpoint: setpointSvelte,
};

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

/** ProjectDoc → ビルド可能な Svelte 5 アプリ一式 */
export const generateSvelteProject = (doc: ProjectDoc, projectName: string): GeneratedFile[] => {
  // 集約があればドメイン層 + 一覧ページ + svelte-spa-router ルートを生成
  const domain = emitSvelteDomain(doc.dataModel);
  const files: GeneratedFile[] = [
    file('package.json', packageJson(projectName)),
    file('vite.config.ts', viteConfig),
    file('svelte.config.js', svelteConfig),
    file('tsconfig.json', tsconfig),
    file('index.html', indexHtml(projectName)),
    file('src/main.ts', mainTs),
    file('src/App.svelte', appSvelte(doc, domain.routes)),
    // Vue/Svelte PoC は tailwind 未配線 → css-variables 固定
    file('src/styles/tokens.css', emitTokensCss(doc.tokens, 'css-variables')),
    file('src/styles/app.css', emitAppCss()),
    ...doc.pages.map((page, i) =>
      file(`src/pages/Page${i}.svelte`, emitSveltePage(page.root, `Page${i}`, '../shared/realtime')),
    ),
    ...domain.files,
  ];

  const used = usedComponents(doc);
  const realtimeUsed = [...used].filter((c) => c in REALTIME_SVELTE);
  if (realtimeUsed.length > 0) {
    files.push(file('src/shared/realtime/severity.ts', severityTs));
    for (const name of realtimeUsed) {
      files.push(file(`src/shared/realtime/${name}.svelte`, REALTIME_SVELTE[name]!));
    }
  }
  return files;
};
