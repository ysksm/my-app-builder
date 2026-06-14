// AppForge デモ: GUI 操作だけでリアルタイム監視ダッシュボードを組み立て、ライブ更新と
// しきい値アラートを確認し、最後に React を実ビルドするまでを Playwright で自動再生する。
//
// 前提: バックエンド(:8787)とビルダー dev サーバー(:5173)を起動しておくこと。
// 実行:  cd demo && npm install && npm run demo:dashboard
//   速度: SPEED=2 / SPEED=0.4、ヘッドレス: HEADLESS=1

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = process.env.APPFORGE_API || 'http://localhost:8787';
const BUILDER = process.env.APPFORGE_BUILDER || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS === '1';
const SPEED = Number(process.env.SPEED || 1);
const SLOWMO = Number(process.env.SLOWMO || 0);
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots-dashboard');

const emptyDoc = () => ({
  schemaVersion: 1,
  pages: [{ id: 'home', name: 'ホーム', path: '/', root: { id: 'root', type: 'container', props: { direction: 'column', gap: 16, padding: 24 }, events: [], children: [] }, useHeader: true, useFooter: true }],
  layout: {
    header: { id: 'hdr', type: 'header', props: { title: 'サーバー監視' }, events: [], children: [] },
    footer: { id: 'ftr', type: 'footer', props: { text: '© 2026 Monitoring Demo' }, events: [], children: [] },
  },
  dialogs: [],
});

async function ensureProject() {
  const list = await (await fetch(`${API}/api/projects`)).json();
  const existing = list.find((p) => p.name === '監視ダッシュボード');
  const body = JSON.stringify({ name: '監視ダッシュボード', doc: emptyDoc() });
  if (existing) {
    await fetch(`${API}/api/projects/${existing.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
    return existing.id;
  }
  return (await (await fetch(`${API}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).json()).id;
}

async function injectHelpers(page, steps, speed) {
  await page.evaluate(({ steps, speed }) => {
    const style = document.createElement('style');
    style.textContent = `
      #td { position: fixed; top: 64px; right: 16px; width: 330px; z-index: 99999; background: #1c2038f2; color: #e8eaf6;
        border: 1px solid #41d6a8; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.5); font: 13px/1.6 system-ui; padding: 16px; backdrop-filter: blur(4px); }
      #td h4 { margin: 0 0 4px; font-size: 15px; color: #6fe3b0; }
      #td .sub { color: #9aa3c7; font-size: 11px; margin-bottom: 10px; }
      #td ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
      #td li { display: flex; gap: 8px; align-items: flex-start; padding: 4px 6px; border-radius: 6px; }
      #td li.active { background: #41d6a822; }
      #td li .ic { flex: none; width: 18px; text-align: center; }
      #td li.done { color: #6fe3b0; } #td li.done .ic::before { content: '✓'; }
      #td li.todo .ic::before { content: '○'; color: #5b6480; }
      #td li.active .ic::before { content: '▶'; color: #ffd166; }
      #td .speed { margin-top: 8px; font-size: 10px; color: #41d6a8; text-align: right; }
      #td .next { margin-top: 10px; padding: 10px; background: #0b0e1a; border-radius: 8px; border-left: 3px solid #41d6a8; font-size: 12px; color: #c7f5e4; min-height: 2.4em; }
      .glow { outline: 3px solid #41d6a8 !important; outline-offset: 2px; border-radius: 6px;
        box-shadow: 0 0 0 6px #41d6a844, 0 0 24px #41d6a899 !important; animation: gp 1s ease-in-out infinite; position: relative; z-index: 9998; }
      @keyframes gp { 0%,100% { box-shadow: 0 0 0 6px #41d6a833, 0 0 18px #41d6a866 !important; } 50% { box-shadow: 0 0 0 10px #41d6a855, 0 0 30px #41d6a8aa !important; } }
    `;
    document.head.appendChild(style);
    const T = {
      steps, speed,
      sleep(ms) { return new Promise((r) => setTimeout(r, ms * this.speed)); },
      init() {
        const el = document.createElement('div'); el.id = 'td';
        el.innerHTML = `<h4>📡 AppForge デモ: 監視ダッシュボード</h4><div class="sub">GUI でチャネル + リアルタイム部品を自動生成</div>` +
          `<ul>${steps.map((s, i) => `<li id="s${i}" class="todo"><span class="ic"></span><span>${s}</span></li>`).join('')}</ul>` +
          `<div class="next" id="next">準備中…</div><div class="speed">速度 x${speed}</div>`;
        document.body.appendChild(el);
      },
      active(i, t) { steps.forEach((_, j) => { const li = document.getElementById('s' + j); if (li) li.className = j < i ? 'done' : j === i ? 'active' : 'todo'; }); document.getElementById('next').textContent = t || steps[i]; },
      done(i) { const li = document.getElementById('s' + i); if (li) li.className = 'done'; },
      next(t) { document.getElementById('next').textContent = t; },
      glow(el) { document.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow')); if (el) { el.classList.add('glow'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } },
      unglow() { document.querySelectorAll('.glow').forEach((e) => e.classList.remove('glow')); },
      topbarBtn(l) { return [...document.querySelectorAll('header button')].find((b) => b.textContent.includes(l)); },
      palette(l) { return [...document.querySelectorAll('.palette-item')].find((e) => e.textContent.includes(l)); },
      dropZone() { return document.querySelector('.drop-empty') || [...document.querySelectorAll('.dropzone')].pop(); },
      async addPart(label) {
        const pal = this.palette(label); this.glow(pal); await this.sleep(450);
        const dt = new DataTransfer(); const o = () => ({ bubbles: true, cancelable: true, dataTransfer: dt });
        pal.dispatchEvent(new DragEvent('dragstart', o())); await this.sleep(120);
        const dz = this.dropZone(); dz.dispatchEvent(new DragEvent('dragover', o())); dz.dispatchEvent(new DragEvent('drop', o()));
        pal.dispatchEvent(new DragEvent('dragend', o())); await this.sleep(350);
        const node = [...document.querySelectorAll('.enode')].pop(); node.click(); await this.sleep(300); return node;
      },
      setNative(el, v) {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      propField(label) { const f = [...document.querySelectorAll('.prop-panel .field')].find((x) => x.querySelector('span')?.textContent?.trim() === label); return f?.querySelector('input,textarea,select'); },
      async setProp(label, v) { for (let i = 0; i < 10; i++) { const f = this.propField(label); if (f) { this.glow(f); await this.sleep(250); this.setNative(f, v); await this.sleep(180); return true; } await new Promise((r) => setTimeout(r, 150)); } return false; },
      async setChannelRef(name) {
        for (let i = 0; i < 10; i++) {
          const sel = this.propField('データチャネル');
          if (sel) { const opt = [...sel.options].find((o) => o.textContent.trim() === name); if (opt) { this.glow(sel); await this.sleep(300); this.setNative(sel, opt.value); await this.sleep(200); return true; } }
          await new Promise((r) => setTimeout(r, 150));
        }
        return false;
      },
      // --- チャネル登録簿 ---
      channelField(card, label) { const f = [...card.querySelectorAll('.channel-field')].find((x) => x.querySelector('span')?.textContent?.trim() === label); return f?.querySelector('input,select'); },
      async addChannel(name, key, min, max, interval) {
        const add = document.querySelector('.channel-add'); this.glow(add); await this.sleep(400); add.click(); await this.sleep(450);
        const card = [...document.querySelectorAll('.channel-card')].pop(); this.glow(card); await this.sleep(300);
        const nameInp = card.querySelector('.channel-name'); if (nameInp) this.setNative(nameInp, name);
        const k = this.channelField(card, 'チャネルキー(WS)'); if (k) this.setNative(k, key);
        const mn = this.channelField(card, '最小値'); if (mn) this.setNative(mn, String(min));
        const mx = this.channelField(card, '最大値'); if (mx) this.setNative(mx, String(max));
        const iv = this.channelField(card, '更新間隔(ms)'); if (iv) this.setNative(iv, String(interval));
        await this.sleep(300);
      },
    };
    window.__d = T; T.init();
  }, { steps, speed });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const id = await ensureProject();
  console.log('project ready:', id, '/ speed x' + SPEED);
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOWMO });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  let shot = 0;
  const snap = async (n) => page.screenshot({ path: join(SHOTS, `${String(++shot).padStart(2, '0')}-${n}.png`) });
  const run = (fn) => page.evaluate(fn);

  const STEPS = [
    'データチャネルを登録(CPU / メモリ / 温度)',
    'ホームに見出しを追加',
    '数値カード3つ(チャネル参照 + しきい値)',
    'ゲージ + チャートを追加',
    'プレビューでライブ更新を確認',
    '実行モードで React ビルド',
  ];

  await page.goto(BUILDER, { waitUntil: 'networkidle' });
  await page.waitForSelector('.palette-item', { timeout: 20000 });
  await page.waitForTimeout(800);
  await injectHelpers(page, STEPS, SPEED);

  // Step 1: チャネル登録
  await run(async () => {
    const T = window.__d;
    T.active(0, '上部「📡 チャネル」で、監視するデータチャネルを3つ登録します(mock データ)。');
    T.glow(T.topbarBtn('チャネル')); await T.sleep(500); T.topbarBtn('チャネル').click(); await T.sleep(700);
    await T.addChannel('CPU 使用率', 'cpu', 0, 100, 800);
    await T.addChannel('メモリ', 'mem', 0, 100, 1000);
    await T.addChannel('温度', 'temp', 30, 95, 1200);
    T.done(0); T.active(1, '「編集」に戻り、ダッシュボードの見出しを置きます。');
    T.glow(T.topbarBtn('編集'));
  });
  await snap('channels');

  // Step 2: 見出し
  await run(async () => {
    const T = window.__d;
    T.topbarBtn('編集').click(); await T.sleep(600);
    await T.addPart('見出し'); await T.setProp('テキスト', '📊 サーバー監視ダッシュボード');
    T.done(1); T.active(2, '数値カードを3つ置き、それぞれチャネルとしきい値を設定します。');
  });
  await snap('heading');

  // Step 3: 数値カード3つ
  await run(async () => {
    const T = window.__d;
    const cards = [
      { ch: 'CPU 使用率', label: 'CPU 使用率', unit: '%', warn: 70, crit: 90 },
      { ch: 'メモリ', label: 'メモリ', unit: '%', warn: 75, crit: 90 },
      { ch: '温度', label: 'CPU 温度', unit: '℃', warn: 70, crit: 85 },
    ];
    for (const c of cards) {
      await T.addPart('数値カード');
      await T.setChannelRef(c.ch);
      await T.setProp('ラベル', c.label);
      await T.setProp('単位', c.unit);
      await T.setProp('警告(以上)', c.warn);
      await T.setProp('危険(以上)', c.crit);
    }
    T.done(2); T.active(3, 'ゲージとチャートを追加し、CPU チャネルを参照します。');
  });
  await snap('metrics');

  // Step 4: ゲージ + チャート
  await run(async () => {
    const T = window.__d;
    await T.addPart('ゲージ'); await T.setChannelRef('CPU 使用率'); await T.setProp('ラベル', 'CPU ゲージ'); await T.setProp('単位', '%'); await T.setProp('警告(以上)', 70); await T.setProp('危険(以上)', 90);
    await T.addPart('チャート'); await T.setChannelRef('CPU 使用率'); await T.setProp('ラベル', 'CPU トレンド'); await T.setProp('単位', '%');
    T.done(3); T.active(4, '上部「▶ プレビュー」で、値がライブ更新し、しきい値で色が変わる様子を確認します。');
    T.glow(T.topbarBtn('プレビュー'));
  });
  await snap('gauge-chart');

  // Step 5: プレビュー(ライブ更新)
  await run(async () => { const T = window.__d; T.topbarBtn('プレビュー').click(); await T.sleep(1000); T.unglow(); T.next('プレビュー: mock データで数値カード・ゲージ・チャートがライブ更新します。'); });
  await page.waitForTimeout(2500 * SPEED);
  await snap('preview-live-1');
  await page.waitForTimeout(2500 * SPEED);
  await run(async () => { const T = window.__d; T.next('しきい値を超えると色が黄/赤に変化し、トーストとイベントが発火します(FR-RT-04)。'); });
  await snap('preview-live-2');

  // Step 6: 実行ビルド
  await run(async () => { const T = window.__d; T.done(4); T.active(5, '最後に「⚡ 実行」で React を実ビルド → プレビューします。'); T.glow(T.topbarBtn('実行')); await T.sleep(600); T.topbarBtn('実行').click(); T.next('React 生成 → npm install → tsc + vite build を実行中…'); });
  await page.waitForFunction(() => /成功|失敗/.test(document.querySelector('.run-status')?.textContent || ''), { timeout: 180000 });
  await run(async () => { const T = window.__d; T.unglow(); const ok = /成功/.test(document.querySelector('.run-status')?.textContent || ''); if (ok) { T.done(5); T.next('✅ 完成! リアルタイム監視ダッシュボードの React アプリを生成・実ビルドできました。'); } else T.next('⚠ ビルド失敗。'); });
  await page.waitForTimeout(4000);
  await snap('built');

  console.log('build status:', await run(() => document.querySelector('.run-status')?.textContent || ''));
  console.log('screenshots:', SHOTS);
  if (!HEADLESS) { console.log('完成。ウィンドウは開いたままです。Ctrl+C で終了。'); await new Promise(() => {}); }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
