// AppForge デモ: GUI 操作だけで「3 ページ + 画面遷移」のある TODO アプリを組み立て、
// プレビューで遷移を確認し、最後に React を実ビルドするまでを Playwright で自動再生する。
// 画面右上にシナリオのチェックリストを出し、次の操作対象をハイライト(グロー)しながら進む。
//
// 前提: バックエンド(http://localhost:8787)とビルダー dev サーバー(http://localhost:5173)
//   端末1: cd backend && cargo run
//   端末2: cd frontend && npm run dev
//
// 実行:  cd demo && npm install && npm run demo
//   速度(倍率、大きいほど遅い):  SPEED=2 npm run demo   / SPEED=0.4 npm run demo
//   ヘッドレス:                   HEADLESS=1 npm run demo
//   スクショ出力先:               demo/screenshots/*.png

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = process.env.APPFORGE_API || 'http://localhost:8787';
const BUILDER = process.env.APPFORGE_BUILDER || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS === '1';
const SPEED = Number(process.env.SPEED || 1); // 全操作の待ち時間に掛かる倍率
const SLOWMO = Number(process.env.SLOWMO || 0); // Playwright ネイティブ操作の slowMo(ms)
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');

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

/** ビルダーへオーバーレイ + ヘルパー(window.__todo)を注入。speed は待ち時間の倍率 */
async function injectHelpers(page, steps, speed) {
  await page.evaluate(({ steps, speed }) => {
    const style = document.createElement('style');
    style.textContent = `
      #todo-demo { position: fixed; top: 64px; right: 16px; width: 330px; z-index: 99999;
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
      #todo-demo .td-speed { margin-top: 8px; font-size: 10px; color: #6c8cff; text-align: right; }
      #todo-demo .td-next { margin-top: 10px; padding: 10px; background: #0b0e1a; border-radius: 8px;
        border-left: 3px solid #ffd166; font-size: 12px; color: #ffe9a8; min-height: 2.4em; }
      .td-glow { outline: 3px solid #ffd166 !important; outline-offset: 2px; border-radius: 6px;
        box-shadow: 0 0 0 6px #ffd16644, 0 0 24px #ffd16699 !important; animation: tdpulse 1s ease-in-out infinite; position: relative; z-index: 9998; }
      @keyframes tdpulse { 0%,100% { box-shadow: 0 0 0 6px #ffd16633, 0 0 18px #ffd16666 !important; } 50% { box-shadow: 0 0 0 10px #ffd16655, 0 0 30px #ffd166aa !important; } }
    `;
    document.head.appendChild(style);

    const T = {
      steps, speed,
      sleep(ms) { return new Promise((r) => setTimeout(r, ms * this.speed)); },
      init() {
        const el = document.createElement('div');
        el.id = 'todo-demo';
        el.innerHTML =
          `<h4>🤖 AppForge デモ: TODO アプリ(画面遷移あり)</h4>` +
          `<div class="td-sub">GUI 操作だけで複数ページ + ナビを自動生成</div>` +
          `<ul>${steps.map((s, i) => `<li id="td-s${i}" class="todo"><span class="ic"></span><span>${s}</span></li>`).join('')}</ul>` +
          `<div class="td-next" id="td-next">準備中…</div>` +
          `<div class="td-speed">速度 x${speed}</div>`;
        document.body.appendChild(el);
      },
      active(i, next) {
        steps.forEach((_, j) => { const li = document.getElementById('td-s' + j); if (li) li.className = j < i ? 'done' : j === i ? 'active' : 'todo'; });
        document.getElementById('td-next').textContent = next || steps[i];
      },
      done(i) { const li = document.getElementById('td-s' + i); if (li) li.className = 'done'; },
      next(text) { document.getElementById('td-next').textContent = text; },
      glow(el) { document.querySelectorAll('.td-glow').forEach((e) => e.classList.remove('td-glow')); if (el) { el.classList.add('td-glow'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } },
      unglow() { document.querySelectorAll('.td-glow').forEach((e) => e.classList.remove('td-glow')); },
      // --- パーツ ---
      palette(label) { return [...document.querySelectorAll('.palette-item')].find((e) => e.textContent.includes(label)); },
      dropZone() { return document.querySelector('.drop-empty') || [...document.querySelectorAll('.dropzone')].pop(); },
      async addPart(label) {
        const pal = this.palette(label); this.glow(pal); await this.sleep(450);
        const dt = new DataTransfer();
        const o = () => ({ bubbles: true, cancelable: true, dataTransfer: dt });
        pal.dispatchEvent(new DragEvent('dragstart', o()));
        await this.sleep(120);
        const dz = this.dropZone();
        dz.dispatchEvent(new DragEvent('dragover', o()));
        dz.dispatchEvent(new DragEvent('drop', o()));
        pal.dispatchEvent(new DragEvent('dragend', o()));
        await this.sleep(350);
        const node = [...document.querySelectorAll('.enode')].pop();
        node.click();
        await this.sleep(300);
        return node;
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
      async setProp(label, value) {
        // プロパティパネルの再描画が間に合うまでフィールドをリトライで探す(速度に依らず堅牢)
        for (let i = 0; i < 10; i++) {
          const f = this.propField(label);
          if (f) { this.glow(f); await this.sleep(300); this.setNative(f, value); await this.sleep(200); return true; }
          await new Promise((r) => setTimeout(r, 150));
        }
        return false;
      },
      // --- イベント(ページ遷移) ---
      async addNavigate(targetPageName) {
        const addBtn = [...document.querySelectorAll('.event-editor .btn')].find((b) => b.textContent.includes('アクション追加'));
        if (!addBtn) return;
        this.glow(addBtn); await this.sleep(400); addBtn.click(); await this.sleep(350);
        const row = [...document.querySelectorAll('.event-editor .event-row')].pop();
        const selects = [...row.querySelectorAll('select')];
        const pageSel = selects.find((s) => ![...s.options].some((o) => o.textContent.includes('ページ遷移'))) || selects[1];
        const opt = [...pageSel.options].find((o) => o.textContent.trim() === targetPageName);
        if (opt) { this.glow(pageSel); await this.sleep(300); this.setNative(pageSel, opt.value); await this.sleep(300); }
      },
      // --- ページ ---
      async addPage() { const b = [...document.querySelectorAll('.pages-panel .btn')].find((x) => x.textContent.includes('ページ追加')); this.glow(b); await this.sleep(400); b.click(); await this.sleep(450); },
      async selectPage(name) {
        const row = [...document.querySelectorAll('.pages-panel .row-main')].find((b) => b.textContent.includes(name));
        if (row) { this.glow(row); await this.sleep(350); row.click(); await this.sleep(450); }
      },
      async renamePage(name, path) {
        const nameInp = this.propField('名前'); if (nameInp) { this.setNative(nameInp, name); await this.sleep(250); }
        const pathInp = this.propField('パス'); if (pathInp) { this.setNative(pathInp, path); await this.sleep(250); }
      },
      topbarBtn(label) { return [...document.querySelectorAll('header button')].find((b) => b.textContent.trim().includes(label)); },
      colorInput(name) { return [...document.querySelectorAll('input[type="color"]')].find((i) => { const t = i.closest('label,div')?.textContent || ''; return t.includes(name) && (name !== 'primary' || !t.includes('primary-text')); }); },
      previewBtn(text) { return [...document.querySelectorAll('.preview-root .c-button')].find((b) => b.textContent.includes(text)); },
      previewPath() { return document.querySelector('.preview-url')?.textContent; },
    };
    window.__todo = T;
    T.init();
  }, { steps, speed });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const projectId = await ensureProject();
  console.log('project ready:', projectId, '/ speed x' + SPEED);

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOWMO });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  let shot = 0;
  const snap = async (name) => page.screenshot({ path: join(SHOTS, `${String(++shot).padStart(2, '0')}-${name}.png`) });
  const run = (fn) => page.evaluate(fn);

  const STEPS = [
    'ページを追加(タスク一覧 / 設定)',
    'ホーム: 見出し + ナビボタン2つ',
    'ナビボタンに遷移先を設定',
    'タスク一覧ページを作成',
    '設定ページを作成',
    'デザインでアクセント色を変更',
    'プレビューで画面遷移を確認',
    '実行モードで React ビルド',
  ];

  await page.goto(BUILDER, { waitUntil: 'networkidle' });
  await page.waitForSelector('.palette-item', { timeout: 20000 });
  await page.waitForTimeout(800);
  await injectHelpers(page, STEPS, SPEED);

  // Step 1: ページ追加(タスク一覧 / 設定)
  await run(async () => {
    const T = window.__todo;
    T.active(0, 'まず左パネルでページを2枚追加し、「タスク一覧」「設定」にリネームします。');
    await T.sleep(500);
    await T.addPage();
    await T.renamePage('タスク一覧', '/tasks');
    await T.addPage();
    await T.renamePage('設定', '/settings');
    await T.selectPage('ホーム');
    T.done(0);
    T.active(1, 'ホームに見出しと、各ページへ移動するナビボタン2つを置きます。');
  });
  await snap('pages');

  // Step 2: ホームに 見出し + ナビボタン2つ
  await run(async () => {
    const T = window.__todo;
    let n = await T.addPart('見出し'); await T.setProp('テキスト', '📋 TODO ホーム');
    n = await T.addPart('ボタン'); await T.setProp('ラベル', '📝 タスク一覧を見る');
    n = await T.addPart('ボタン'); await T.setProp('ラベル', '⚙ 設定');
    T.done(1);
    T.active(2, '各ボタンにクリック時の「ページ遷移」を設定します。');
  });
  await snap('home-parts');

  // Step 3: ナビボタンに遷移先を設定
  await run(async () => {
    const T = window.__todo;
    // 「タスク一覧を見る」ボタンを選択 → navigate → タスク一覧
    const btn1 = [...document.querySelectorAll('.enode')].find((e) => e.textContent.includes('タスク一覧を見る'));
    if (btn1) { T.glow(btn1); await T.sleep(400); btn1.click(); await T.sleep(400); await T.addNavigate('タスク一覧'); }
    // 「設定」ボタンを選択 → navigate → 設定
    const btn2 = [...document.querySelectorAll('.enode')].find((e) => e.textContent.trim().startsWith('ボタン') && e.textContent.includes('設定'));
    if (btn2) { T.glow(btn2); await T.sleep(400); btn2.click(); await T.sleep(400); await T.addNavigate('設定'); }
    T.done(2);
    T.active(3, '「タスク一覧」ページへ移動して、入力欄・追加ボタン・一覧表・戻るボタンを置きます。');
  });
  await snap('home-nav');

  // Step 4: タスク一覧ページ
  await run(async () => {
    const T = window.__todo;
    await T.selectPage('タスク一覧');
    await T.addPart('見出し'); await T.setProp('テキスト', '📝 タスク一覧');
    await T.addPart('入力'); await T.setProp('ラベル', '新しいタスク'); await T.setProp('プレースホルダ', '例: 牛乳を買う');
    await T.addPart('ボタン'); await T.setProp('ラベル', '＋ タスクを追加');
    await T.addPart('テーブル'); await T.setProp('列(カンマ区切り)', 'タスク, 状態, 期限'); await T.setProp('行数', '3');
    const back = await T.addPart('ボタン'); await T.setProp('ラベル', '🏠 ホームへ戻る');
    back.click(); await T.sleep(400); await T.addNavigate('ホーム');
    T.done(3);
    T.active(4, '「設定」ページへ移動して、説明テキストと戻るボタンを置きます。');
  });
  await snap('tasks-page');

  // Step 5: 設定ページ
  await run(async () => {
    const T = window.__todo;
    await T.selectPage('設定');
    await T.addPart('見出し'); await T.setProp('テキスト', '⚙ 設定');
    await T.addPart('テキスト'); await T.setProp('本文', 'テーマや通知の設定をここで管理します(デモ)。');
    const back = await T.addPart('ボタン'); await T.setProp('ラベル', '🏠 ホームへ戻る');
    back.click(); await T.sleep(400); await T.addNavigate('ホーム');
    T.done(4);
    T.active(5, '上部「🎨 デザイン」でアクセント色を変更します(全ページに即反映)。');
    T.glow(T.topbarBtn('デザイン'));
  });
  await snap('settings-page');

  // Step 6: デザイン
  await run(async () => {
    const T = window.__todo;
    T.topbarBtn('デザイン').click(); await T.sleep(700);
    const p = T.colorInput('primary'); if (p) { T.glow(p); await T.sleep(600); T.setNative(p, '#7048e8'); await T.sleep(500); }
    const h = T.colorInput('header-bg'); if (h) T.setNative(h, '#5f3dc4');
    await T.sleep(400);
    T.done(5);
    T.active(6, '上部「▶ プレビュー」で、ホーム→一覧→設定 の画面遷移を実際にクリックして確認します。');
    T.glow(T.topbarBtn('プレビュー'));
  });
  await snap('design');

  // Step 7: プレビューで画面遷移を確認
  await run(async () => { const T = window.__todo; T.topbarBtn('プレビュー').click(); await T.sleep(900); T.unglow(); T.next('プレビュー: ホーム画面。ナビボタンで遷移します。'); });
  await snap('preview-home');

  await run(async () => { const T = window.__todo; const b = T.previewBtn('タスク一覧を見る'); if (b) { T.glow(b); await T.sleep(700); b.click(); } await T.sleep(900); T.unglow(); T.next('「タスク一覧を見る」をクリック → /tasks へ遷移しました。'); });
  await snap('preview-tasks');

  await run(async () => { const T = window.__todo; const b = T.previewBtn('ホームへ戻る'); if (b) { T.glow(b); await T.sleep(700); b.click(); } await T.sleep(800); const b2 = T.previewBtn('設定'); if (b2) { T.glow(b2); await T.sleep(700); b2.click(); } await T.sleep(900); T.unglow(); T.next('ホーム経由で「設定」へ遷移 → /settings。画面遷移が動作しています。'); });
  await snap('preview-settings');

  await run(async () => {
    const T = window.__todo;
    const b = T.previewBtn('ホームへ戻る'); if (b) { b.click(); } await T.sleep(700);
    T.done(6);
    T.active(7, '最後に「⚡ 実行」で React アプリを実ビルド → プレビューします。');
    T.glow(T.topbarBtn('実行'));
  });

  // Step 8: 実行モードで React ビルド
  await run(async () => { const T = window.__todo; T.topbarBtn('実行').click(); T.next('React ソース生成 → npm install → tsc + vite build を実行中…'); });
  await page.waitForFunction(() => /成功|失敗/.test(document.querySelector('.run-status')?.textContent || ''), { timeout: 180000 });
  await run(async () => {
    const T = window.__todo; T.unglow();
    const ok = /成功/.test(document.querySelector('.run-status')?.textContent || '');
    if (ok) { T.done(7); T.next('✅ 完成! 3 ページ + 画面遷移つき TODO アプリの React ソースを生成・実ビルドできました。'); }
    else { T.next('⚠ ビルドに失敗しました。バックエンドのログを確認してください。'); }
  });
  await page.waitForTimeout(3500);
  await snap('built');

  console.log('build status:', await run(() => document.querySelector('.run-status')?.textContent || ''));
  console.log('screenshots:', SHOTS);
  if (!HEADLESS) { console.log('完成しました。ウィンドウは開いたままです。Ctrl+C で終了します。'); await new Promise(() => {}); }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
