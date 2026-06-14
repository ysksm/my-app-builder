import type { ProjectDoc } from '@/domain/project-doc';
import type { ComponentNode } from '@/domain/component-node';
import { emitAppCss, emitTokensCss } from './emit-css';
import { emitReactElement, emitReactRoute } from './emit-react-element';
import { screenStyleJs } from './screen-style';
import { emitRemixDomain } from './emit-remix-domain';
import type { GeneratedFile } from './files';
import { collectComponents, toUiTree } from './ui-model';

/**
 * Remix(React Router 7 framework、SPA モード)generator(FR-GEN-07)。
 * 中立 UI モデルから、ビルド可能な RR7 アプリ(root + ファイルルート + ページ + CSS)を生成。
 * SPA ビルドは build/client に出るため、build スクリプトで dist/ へコピーして BE が配信できる。
 * 対象は UI 層(画面 + ルーティング + モニタリング mock)。
 */

const V = {
  react: '^18.3.1',
  reactDom: '^18.3.1',
  reactRouter: '^7.1.1',
  rrDev: '^7.1.1',
  typesReact: '^18.3.18',
  typesReactDom: '^18.3.5',
  typescript: '^5.7.3',
  vite: '^6.0.7',
  isbot: '^5.1.21',
  tailwind: '^4.3.1',
  tailwindVite: '^4.3.1',
} as const;

const file = (path: string, content: string): GeneratedFile => ({ path, content });

const toPackageName = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'remix-app';

const packageJson = (projectName: string, tailwind: boolean): string =>
  `${JSON.stringify(
    {
      name: toPackageName(projectName),
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'react-router dev',
        // SPA ビルドは build/client に出力 → BE が配信する dist/ へ複製
        build: 'react-router build && rm -rf dist && cp -r build/client dist',
        typecheck: 'react-router typegen && tsc --noEmit',
      },
      dependencies: {
        '@react-router/node': V.reactRouter,
        isbot: V.isbot,
        react: V.react,
        'react-dom': V.reactDom,
        'react-router': V.reactRouter,
      },
      devDependencies: {
        '@react-router/dev': V.rrDev,
        '@types/react': V.typesReact,
        '@types/react-dom': V.typesReactDom,
        ...(tailwind ? { '@tailwindcss/vite': V.tailwindVite, tailwindcss: V.tailwind } : {}),
        typescript: V.typescript,
        vite: V.vite,
      },
    },
    null,
    2,
  )}\n`;

// vite の base と RR7 の basename を一致させる。プレビュー(サブパス配信)では
// その配信パスを、ルート配備(エクスポート)では '/' を渡す。
const viteConfig = (basename: string, tailwind: boolean): string => `// 自動生成 — AppForge(Remix / React Router 7)
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';${tailwind ? `\nimport tailwindcss from '@tailwindcss/vite';` : ''}

export default defineConfig({
  base: ${JSON.stringify(basename)},
  plugins: [${tailwind ? 'tailwindcss(), ' : ''}reactRouter()],
});
`;

const rrConfig = (basename: string): string => `import type { Config } from '@react-router/dev/config';

// SPA モード(SSR なし)。静的ホスティング(BE の dist 配信)に載せられる。
// basename はパスルーティングを配信サブパスに合わせるため(ルート配備時は '/')。
export default {
  ssr: false,
  basename: ${JSON.stringify(basename)},
} satisfies Config;
`;

const tsconfig = `${JSON.stringify(
  {
    include: ['app/**/*', '.react-router/types/**/*'],
    compilerOptions: {
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      types: ['@react-router/node', 'vite/client'],
      rootDirs: ['.', './.react-router/types'],
      baseUrl: '.',
      noEmit: true,
    },
  },
  null,
  2,
)}\n`;

/** app/root.tsx: HTML シェル(Layout)+ ルートコンポーネント。共通ヘッダー/フッターもここ */
const rootTsx = (doc: ProjectDoc): string => {
  const header = doc.layout.header ? emitReactElement(toUiTree(doc.layout.header), 5).join('\n') : '';
  const footer = doc.layout.footer ? emitReactElement(toUiTree(doc.layout.footer), 5).join('\n') : '';
  return `// 自動生成 — AppForge(Remix / React Router 7)
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './styles/tokens.css';
import './styles/app.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="app-root">
${header}
          <main className="page-main">{children}</main>
${footer}
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`;
};

/** app/routes.ts: doc.pages → ファイルルート設定(+ ドメイン一覧ルート) */
const routesTs = (doc: ProjectDoc, extraEntries: ReadonlyArray<string>): string => {
  const pageEntries = doc.pages.map((p, i) => {
    const rel = p.path.replace(/^\//, '');
    return rel === '' ? `  index('routes/page${i}.tsx'),` : `  route(${JSON.stringify(rel)}, 'routes/page${i}.tsx'),`;
  });
  return `// 自動生成 — AppForge(Remix ルート設定)
import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
${[...pageEntries, ...extraEntries].join('\n')}
] satisfies RouteConfig;
`;
};

// ---------- モニタリング部品(mock React、Remix 用に1モジュール集約)----------

const realtimeTsx = `// 自動生成 — AppForge(Remix): モニタリング部品(mock データ)
import { useEffect, useState } from 'react';

type Thresholds = { warnAbove?: number; critAbove?: number; warnBelow?: number; critBelow?: number };
function severity(v: number | null, t: Thresholds): 'normal' | 'warn' | 'crit' {
  if (v === null) return 'normal';
  if ((t.critAbove != null && v >= t.critAbove) || (t.critBelow != null && v <= t.critBelow)) return 'crit';
  if ((t.warnAbove != null && v >= t.warnAbove) || (t.warnBelow != null && v <= t.warnBelow)) return 'warn';
  return 'normal';
}
function useMock(min: number, max: number, interval: number): number | null {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setV(min + Math.random() * (max - min));
    tick();
    const id = setInterval(tick, Math.max(200, interval));
    return () => clearInterval(id);
  }, [min, max, interval]);
  return v;
}

type Common = Thresholds & { label: string; unit?: string; min: number; max: number; interval: number; decimals?: number };

export function Metric(p: Common) {
  const v = useMock(p.min, p.max, p.interval);
  const s = severity(v, p);
  return (
    <div className={'c-metric' + (s !== 'normal' ? ' s-' + s : '')}>
      <span className="c-metric-label">{p.label}</span>
      <span className="c-metric-value">{v === null ? '—' : v.toFixed(p.decimals ?? 0)}<span className="c-metric-unit">{p.unit}</span></span>
    </div>
  );
}

export function Gauge(p: Common) {
  const v = useMock(p.min, p.max, p.interval);
  const s = severity(v, p);
  const ratio = v === null || p.max <= p.min ? 0 : Math.min(1, Math.max(0, (v - p.min) / (p.max - p.min)));
  return (
    <div className={'c-gauge' + (s !== 'normal' ? ' s-' + s : '')}>
      <div className="c-gauge-head">
        <span className="c-gauge-label">{p.label}</span>
        <span className="c-gauge-value">{v === null ? '—' : v.toFixed(p.decimals ?? 1)}{p.unit}</span>
      </div>
      <div className="c-gauge-track"><div className="c-gauge-fill" style={{ width: (ratio * 100).toFixed(1) + '%' }} /></div>
    </div>
  );
}

export function Lamp(p: Common) {
  const v = useMock(p.min, p.max, p.interval);
  const s = severity(v, p);
  return (
    <div className="c-lamp">
      <span className={'c-lamp-dot s-' + s} />
      <span className="c-lamp-label">{p.label}</span>
      <span className="c-lamp-value">{v === null ? '—' : v.toFixed(0)}</span>
    </div>
  );
}

export function Chart(p: Common & { capacity?: number }) {
  const [series, setSeries] = useState<number[]>([]);
  const W = 240, H = 56;
  useEffect(() => {
    const cap = Math.max(2, p.capacity ?? 40);
    const tick = () => setSeries((prev) => {
      const next = prev.concat(p.min + Math.random() * (p.max - p.min));
      return next.length > cap ? next.slice(next.length - cap) : next;
    });
    tick();
    const id = setInterval(tick, Math.max(200, p.interval));
    return () => clearInterval(id);
  }, [p.min, p.max, p.interval, p.capacity]);
  const v = series.length > 0 ? series[series.length - 1]! : null;
  const s = severity(v, p);
  const points = series.map((val, i) => {
    const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * W;
    const r = p.max <= p.min ? 0 : Math.min(1, Math.max(0, (val - p.min) / (p.max - p.min)));
    return x.toFixed(1) + ',' + (H - r * H).toFixed(1);
  }).join(' ');
  return (
    <div className={'c-chart' + (s !== 'normal' ? ' s-' + s : '')}>
      <div className="c-chart-head">
        <span className="c-chart-label">{p.label}</span>
        <span className="c-chart-value">{v === null ? '—' : v.toFixed(p.decimals ?? 1)}{p.unit}</span>
      </div>
      <svg className="c-chart-svg" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none">
        {series.length > 1 && <polyline className="c-chart-line" points={points} fill="none" />}
      </svg>
    </div>
  );
}

export function Setpoint(p: { label: string; unit?: string; value: number; writeLabel: string; confirmMessage: string }) {
  const [current, setCurrent] = useState<number>(p.value);
  const [status, setStatus] = useState<string>('');
  const submit = () => {
    if (!window.confirm(p.confirmMessage)) return;
    setStatus('送信(PoC)');
  };
  return (
    <div className="c-setpoint">
      <span className="c-setpoint-label">{p.label}</span>
      <div className="c-setpoint-row">
        <input className="c-setpoint-input" type="number" value={current} onChange={(e) => setCurrent(Number(e.target.value))} />
        <span className="c-setpoint-unit">{p.unit}</span>
        <button className="c-setpoint-btn" type="button" onClick={submit}>{p.writeLabel}</button>
      </div>
      {status && <span className="c-setpoint-status">{status}</span>}
    </div>
  );
}
`;

const usesRealtime = (doc: ProjectDoc): boolean => {
  const has = (n: ComponentNode | null): boolean => {
    if (!n) return false;
    return collectComponents(toUiTree(n)).size > 0;
  };
  return (
    doc.pages.some((p) => has(p.root)) ||
    doc.dialogs.some((d) => has(d.root)) ||
    has(doc.layout.header) ||
    has(doc.layout.footer)
  );
};

/**
 * ProjectDoc → ビルド可能な Remix(RR7 SPA)アプリ一式。
 * basename はパスルーティングを配信パスに合わせるため(プレビュー=サブパス /
 * ルート配備・エクスポート=既定 '/')。末尾は正規化して与える。
 */
export const generateRemixProject = (
  doc: ProjectDoc,
  projectName: string,
  basename = '/',
): GeneratedFile[] => {
  const base = basename.endsWith('/') ? basename : `${basename}/`;
  const tailwind = doc.styleEmitter === 'tailwind';
  // 集約があればドメイン層 + 一覧ルートを生成
  const domain = emitRemixDomain(doc.dataModel);
  const files: GeneratedFile[] = [
    file('package.json', packageJson(projectName, tailwind)),
    file('vite.config.ts', viteConfig(base, tailwind)),
    file('react-router.config.ts', rrConfig(base)),
    file('tsconfig.json', tsconfig),
    file('app/root.tsx', rootTsx(doc)),
    file('app/routes.ts', routesTs(doc, domain.routeEntries)),
    file('app/styles/tokens.css', emitTokensCss(doc.tokens, doc.styleEmitter)),
    file('app/styles/app.css', emitAppCss()),
    ...doc.pages.map((page, i) =>
      file(
        `app/routes/page${i}.tsx`,
        emitReactRoute(page.root, `Page${i}`, '../shared/realtime', screenStyleJs(page.screen)),
      ),
    ),
    ...domain.files,
  ];
  if (usesRealtime(doc)) {
    files.push(file('app/shared/realtime.tsx', realtimeTsx));
  }
  return files;
};
