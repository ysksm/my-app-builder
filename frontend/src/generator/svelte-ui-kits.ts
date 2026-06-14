import type { GeneratedFile } from './files';

/**
 * Svelte の UIライブラリ(kit)アダプタ(FR-GUI-11)。Svelte 生成は中立ツリー(ui-model)経由なので、
 * kit は「対象種別 → ラッパーコンポーネント参照(tagMap)」+「ラッパー .svelte の生成」で実現する。
 * Bits UI(ヘッドレス)のコンパウンド API はラッパー内に隠蔽し、スタイルは c-* トークンを流用する。
 */
export type SvelteUiKit = Readonly<{
  id: string;
  deps: Readonly<Record<string, string>>;
  /** 中立ツリーで差し替える種別 → ラッパーのタグ名 */
  tagMap: Readonly<Partial<Record<string, string>>>;
  /** 使用中ラッパーの .svelte ファイルを返す */
  files: (used: ReadonlySet<string>) => GeneratedFile[];
}>;

const PLAIN: SvelteUiKit = { id: 'plain', deps: {}, tagMap: {}, files: () => [] };

// ---- Bits UI(ヘッドレス。Accordion / DropdownMenu をラップ)----
const disclosureSvelte = `<!-- 自動生成 — AppForge(Svelte): Bits UI アコーディオン -->
<script lang="ts">
  import { Accordion } from 'bits-ui';
  let { title, content }: { title: string; content: string; [key: string]: unknown } = $props();
</script>
<Accordion.Root type="single" class="c-disclosure">
  <Accordion.Item value="item">
    <Accordion.Header>
      <Accordion.Trigger class="c-disclosure-summary">{title}</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content class="c-disclosure-content">{content}</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
`;

const menuSvelte = `<!-- 自動生成 — AppForge(Svelte): Bits UI ドロップダウン -->
<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  let { label, items }: { label: string; items: string; [key: string]: unknown } = $props();
  const list = items.split(',').map((s) => s.trim()).filter(Boolean);
</script>
<DropdownMenu.Root>
  <DropdownMenu.Trigger class="c-menu-button">{label}</DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="c-menu-list">
      {#each list as item (item)}
        <DropdownMenu.Item class="c-menu-item">{item}</DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
`;

const BITS_FILES: Readonly<Record<string, string>> = {
  Disclosure: disclosureSvelte,
  Menu: menuSvelte,
};

const BITS: SvelteUiKit = {
  id: 'bits',
  deps: { 'bits-ui': '^1.3.0' },
  tagMap: { disclosure: 'Disclosure', menu: 'Menu' },
  // ラッパーは page と同じ importBase(shared/realtime)に置き、既存の import 機構を再利用する
  files: (used) =>
    Object.keys(BITS_FILES)
      .filter((tag) => used.has(tag))
      .map((tag) => ({ path: `src/shared/realtime/${tag}.svelte`, content: BITS_FILES[tag]! })),
};

const SVELTE_KITS: Readonly<Record<string, SvelteUiKit>> = { plain: PLAIN, bits: BITS };

export const resolveSvelteKit = (id: string | undefined): SvelteUiKit =>
  SVELTE_KITS[id ?? 'plain'] ?? PLAIN;
