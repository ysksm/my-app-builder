// AppForge デモ: GUI 操作だけで TODO アプリを組み立て、React を実ビルドするまでを
// Playwright で自動再生する。画面右上にシナリオのチェックリストを出し、次の操作対象を
// ハイライト(グロー)しながら進める。
//
// 前提: バックエンド(http://localhost:8787)とビルダーの dev サーバー
//       (http://localhost:5173)が起動していること。
//   端末1: cd backend && cargo run
//   端末2: cd frontend && npm run dev
//
// 実行:  cd demo && npm install && npm run demo
//   ヘッドレスで動かす:        HEADLESS=1 npm run demo
//   速度調整(ms):             SLOWMO=200 npm run demo
//   スクショ出力先:            demo/screenshots/*.png

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = process.env.APPFORGE_API || 'http://localhost:8787';
const BUILDER = process.env.APPFORGE_BUILDER || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS === '1';
const SLOWMO = Number(process.env.SLOWMO || 60);
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');

/** 空ホーム + ティール前のヘッダー/フッターを持つ TODO プロジェクトの初期ドキュメント */
const emptyDoc = () => ({
  schemaVersion: 1,
  pages: [
    {
      id: 'home',
      name: 'ホーム',
      path: '/',
      root: { id: 'root', type: 'container', props: { direction: 'column', gap: 16, padding: 24 }, events: [], children: [] },
      useHeader: true,
      useFooter: true,
    },
  ],
  layout: {
    header: { id: 'hdr', type: 'header', props: { title: 'TODO アプリ' }, events: [], children: [] },
    footer: { id: 'ftr', type: 'footer', props: { text: '© 2026 TODO Demo' }, events: [], children: [] },
  },
  dialogs: [],
});

/** 「TODO アプリ」プロジェクトを用意(あればリセット / なければ作成)。最新になるので builder が開く */
async function ensureProject() {
  const list = await (await fetch(`${API}/api/projects`)).json();
  const existing = list.find((p) => p.name === 'TODO アプリ');
  const body = JSON.stringify({ name: 'TODO アプリ', doc: emptyDoc() });
  if (existing) {
    await fetch(`${API}/api/projects/${existing.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
    return existing.id;
  }
  const created = await (await fetch(`${API}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).json();
  return created.id;
}

/** ビルダーのページにデモ用オーバーレイ + ヘルパー(window.__todo)を注入する */
async function injectHelpers(page, steps) {
  await page.evaluate((steps) => {
    const style = document.createElement('style');
    style.textContent = `
      #todo-demo { position: fixed; top: 64px; right: 16px; width: 320px; z-index: 99999;
        background: #1c2038f2; color: #e8eaf6; border: 1px solid #6c8cff; border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,.5); font: 13px/1.6 system-ui; padding: 16px; backdrop-filter: blur(4px); }
      #todo-demo h4 { margin: 0 0 4px; font-size: 15px; color: #8fa6ff; }
      #todo-demo .td-sub { color: #9aa3c7; font-size: 11px; margin-bottom: 10px; }
      #todo-demo ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
      #todo-demo li { display: flex; gap: 8px; align-items: flex-start; padding: 4px 6px; border-radius: 6px; transition: background .3s; }
      #todo-demo li.active { background: #6c8cff22; }
      #todo-demo li .ic { flex: none; width: 18px; text-align: center; }
      #todo-demo li.done { color: #6fe3b0; }
      #todo-demo li.done .ic::before { content: '✓'; }
      #todo-demo li.todo .ic::before { content: '○'; color: #5b6480; }
      #todo-demo li.active .ic::before { content: '▶'; color: #ffd166; }
      #todo-demo .td-next { margin-top: 12px; padding: 10px; background: #0b0e1a; border-radius: 8px;
        border-left: 3px solid #ffd166; font-size: 12px; color: #ffe9a8; min-height: 2.4em; }
      .td-glow { outline: 3px solid #ffd166 !important; outline-offset: 2px; border-radius: 6px;
        box-shadow: 0 0 0 6px #ffd16644, 0 0 24px #ffd16699 !important; animation: tdpulse 1s ease-in-out infinite; position: relative; z-index: 9998; }
      @keyframes tdpulse { 0%,100% { box-shadow: 0 0 0 6px #ffd16633, 0 0 18px #ffd16666 !important; } 50% { box-shadow: 0 0 0 10px #ffd16655, 0 0 30px #ffd166aa !important; } }
    `;
    document.head.appendChild(style);

    const T = {
      steps,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      init() {
        const el = document.createElement('div');
        el.id = 'todo-demo';
        el.innerHTML =
          `<h4>🤖 AppForge デモ: TODO アプリ</h4>` +
          `<div class="td-sub">GUI から TODO アプリを自動生成します</div>` +
          `<ul>${steps.map((s, i) => `<li id="td-s${i}" class="todo"><span class="ic"></span><span>${s}</span></li>`).join('')}</ul>` +
          `<div class="td-next" id="td-next">準備中…</div>`;
        document.body.appendChild(el);
      },
      active(i, next) {
        steps.forEach((_, j) => {
          const li = document.getElementById('td-s' + j);
          if (li) li.className = j < i ? 'done' : j === i ? 'active' : 'todo';
        });
        document.getElementById('td-next').textContent = next || steps[i];
      },
      done(i) { const li = document.getElementById('td-s' + i); if (li) li.className = 'done'; },
      next(text) { document.getElementById('td-next').textContent = text; },
      glow(el) {
        document.querySelectorAll('.td-glow').forEach((e) => e.classList.remove('td-glow'));
        if (el) { el.classList.add('td-glow'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      },
      unglow() { document.querySelectorAll('.td-glow').forEach((e) => e.classList.remove('td-glow')); },
      palette(label) { return [...document.querySelectorAll('.palette-item')].find((e) => e.textContent.includes(label)); },
      dropZone() { return document.querySelector('.drop-empty') || [...document.querySelectorAll('.dropzone')].pop(); },
      async addPart(label) {
        const pal = this.palette(label);
        const dt = new DataTransfer();
        const o = () => ({ bubbles: true, cancelable: true, dataTransfer: dt });
        pal.dispatchEvent(new DragEvent('dragstart', o()));
        await this.sleep(120);
        const dz = this.dropZone();
        dz.dispatchEvent(new DragEvent('dragover', o()));
        dz.dispatchEvent(new DragEvent('drop', o()));
        pal.dispatchEvent(new DragEvent('dragend', o()));
        await this.sleep(350);
        return [...document.querySelectorAll('.enode')].pop();
      },
      setNative(el, value) {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      propField(label) {
        const f = [...document.querySelectorAll('.prop-panel .field, .panel-section .field')].find((x) => x.querySelector('span')?.textContent?.trim() === label);
        return f?.querySelector('input, textarea, select');
      },
      topbarBtn(label) { return [...document.querySelectorAll('header button')].find((b) => b.textContent.trim().includes(label)); },
      colorInput(name) {
        return [...document.querySelectorAll('input[type="color"]')].find((i) => {
          const t = i.closest('label,div')?.textContent || '';
          return t.includes(name) && (name !== 'primary' || !t.includes('primary-text'));
        });
      },
    };
    window.__todo = T;
    T.init();
  }, steps);
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const projectId = await ensureProject();
  console.log('project ready:', projectId);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOWMO });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  let shot = 0;
  const snap = async (name) => page.screenshot({ path: join(SHOTS, `${String(++shot).padStart(2, '0')}-${name}.png`) });

  const STEPS = [
    '見出し「マイ TODO リスト」を追加',
    '入力欄「新しいタスク」を追加',
    'ボタン「＋ 追加」を追加',
    'テーブル(タスク/状態/期限)を追加',
    'デザインでアクセント色を変更',
    'プレビューで動作確認',
    '実行モードで React ビルド',
  ];

  await page.goto(BUILDER, { waitUntil: 'networkidle' });
  await page.waitForSelector('.palette-item', { timeout: 20000 });
  await page.waitForTimeout(800);
  await injectHelpers(page, STEPS);
  await page.evaluate(() => {
    const T = window.__todo;
    T.active(0, 'これから GUI 操作で TODO アプリを組み立てます。左の「H 見出し」パーツをキャンバスへ。');
    T.glow(T.palette('見出し'));
  });
  await snap('start');

  // Step 1: 見出し
  await page.evaluate(async () => {
    const T = window.__todo;
    const node = await T.addPart('見出し');
    node.click();
    await T.sleep(400);
    const f = T.propField('テキスト');
    if (f) { T.glow(f); await T.sleep(400); T.setNative(f, '📝 マイ TODO リスト'); }
    await T.sleep(300);
    T.done(0);
    T.active(1, '「✎ 入力」パーツをキャンバスへ。タスク入力欄になります。');
    T.glow(T.palette('入力'));
  });
  await snap('heading');

  // Step 2: 入力欄
  await page.evaluate(async () => {
    const T = window.__todo;
    const node = await T.addPart('入力');
    node.click();
    await T.sleep(400);
    const f = T.propField('ラベル');
    if (f) { T.glow(f); await T.sleep(400); T.setNative(f, '新しいタスク'); }
    const ph = T.propField('プレースホルダ');
    if (ph) T.setNative(ph, '例: 牛乳を買う');
    await T.sleep(300);
    T.done(1);
    T.active(2, '「⏺ ボタン」パーツをキャンバスへ。タスク追加ボタンになります。');
    T.glow(T.palette('ボタン'));
  });
  await snap('input');

  // Step 3: ボタン
  await page.evaluate(async () => {
    const T = window.__todo;
    const node = await T.addPart('ボタン');
    node.click();
    await T.sleep(400);
    const f = T.propField('ラベル');
    if (f) { T.glow(f); await T.sleep(400); T.setNative(f, '＋ タスクを追加'); }
    await T.sleep(300);
    T.done(2);
    T.active(3, '「▤ テーブル」パーツをキャンバスへ。タスク一覧表になります。');
    T.glow(T.palette('テーブル'));
  });
  await snap('button');

  // Step 4: テーブル
  await page.evaluate(async () => {
    const T = window.__todo;
    const node = await T.addPart('テーブル');
    node.click();
    await T.sleep(400);
    const cols = T.propField('列(カンマ区切り)');
    if (cols) { T.glow(cols); await T.sleep(400); T.setNative(cols, 'タスク, 状態, 期限'); }
    const rows = T.propField('行数');
    if (rows) T.setNative(rows, '3');
    await T.sleep(300);
    T.done(3);
    T.active(4, '上部「🎨 デザイン」へ。トークンでアクセント色を変えると全体に即反映されます。');
    T.glow(T.topbarBtn('デザイン'));
  });
  await snap('table');

  // Step 5: デザイン(アクセント色)
  await page.evaluate(async () => {
    const T = window.__todo;
    T.topbarBtn('デザイン').click();
    await T.sleep(700);
    const primary = T.colorInput('primary');
    if (primary) { T.glow(primary); await T.sleep(600); T.setNative(primary, '#0ca678'); await T.sleep(500); }
    const headerBg = T.colorInput('header-bg');
    if (headerBg) T.setNative(headerBg, '#0b7a5c');
    await T.sleep(400);
    T.done(4);
    T.active(5, '上部「▶ プレビュー」へ。実際にページ遷移やボタンが動く状態を確認します。');
    T.glow(T.topbarBtn('プレビュー'));
  });
  await snap('design');

  // Step 6: プレビュー
  await page.evaluate(async () => {
    const T = window.__todo;
    T.topbarBtn('プレビュー').click();
    await T.sleep(800);
    T.unglow();
    T.done(5);
    T.active(6, '最後に上部「⚡ 実行」へ。ソースを生成し React アプリを実ビルド→プレビューします。');
  });
  await snap('preview');

  // Step 7: 実行モードで React ビルド
  await page.evaluate(async () => {
    const T = window.__todo;
    T.glow(T.topbarBtn('実行'));
    await T.sleep(600);
    T.topbarBtn('実行').click();
    T.next('React ソース生成 → npm install → tsc + vite build を実行中…(初回は少し時間がかかります)');
  });
  // ビルド完了を待つ(最大3分)
  await page.waitForFunction(
    () => /成功|失敗/.test(document.querySelector('.run-status')?.textContent || ''),
    { timeout: 180000 },
  );
  await page.evaluate(async () => {
    const T = window.__todo;
    T.unglow();
    const ok = /成功/.test(document.querySelector('.run-status')?.textContent || '');
    if (ok) {
      T.done(6);
      T.next('✅ 完成! GUI 操作だけで TODO アプリの React ソースを生成・ビルドできました。右下のプレビューが実ビルド成果物です。');
    } else {
      T.next('⚠ ビルドに失敗しました。バックエンドのログを確認してください。');
    }
  });
  await page.waitForTimeout(3500); // iframe ロード
  await snap('built');

  const status = await page.evaluate(() => document.querySelector('.run-status')?.textContent || '');
  console.log('build status:', status);
  console.log('screenshots:', SHOTS);

  if (!HEADLESS) {
    console.log('完成しました。ウィンドウは開いたままです。Ctrl+C で終了します。');
    await new Promise(() => {}); // ヘッド付きは閉じずに観察できるよう待機
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
