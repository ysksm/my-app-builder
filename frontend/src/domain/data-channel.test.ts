import { describe, expect, it } from 'vitest';
import { ComponentNode } from './component-node';
import { EditTarget, ProjectDoc } from './project-doc';
import { parseProjectDoc } from './schema';
import { applyCommand } from '@/application/commands';
import { generateProject } from '@/generator/index';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

describe('DataChannelDef レジストリ(FR-RT-01)', () => {
  it('addChannel / updateChannel / removeChannel が登録簿を更新する', () => {
    const base = ProjectDoc.create();
    const { doc: d1, channel } = ProjectDoc.addChannel(base, '温度センサ', {
      key: 'temp',
      source: 'modbus',
      min: 0,
      max: 200,
      host: '127.0.0.1:5502',
      register: 5,
      scale: 0.1,
    });
    expect(d1.channels).toHaveLength(1);
    expect(ProjectDoc.findChannel(d1, channel.id)?.key).toBe('temp');

    const d2 = unwrap(ProjectDoc.updateChannel(d1, channel.id, { max: 300 }));
    expect(ProjectDoc.findChannel(d2, channel.id)?.max).toBe(300);

    const d3 = unwrap(ProjectDoc.removeChannel(d2, channel.id));
    expect(d3.channels).toHaveLength(0);
  });

  it('存在しないチャネルの更新/削除は notFound', () => {
    const base = ProjectDoc.create();
    expect(ProjectDoc.updateChannel(base, 'nope' as never, { max: 1 }).ok).toBe(false);
    expect(ProjectDoc.removeChannel(base, 'nope' as never).ok).toBe(false);
  });

  it('addChannel コマンドは作成した channelId を outcome.created で返す', () => {
    const res = applyCommand(ProjectDoc.create(), { kind: 'addChannel', name: 'CPU', patch: { key: 'cpu' } });
    const out = unwrap(res);
    expect(out.created.channelId).toBeDefined();
    expect(out.doc.channels[0]!.key).toBe('cpu');
  });

  it('channels 未保存の旧ドキュメントは空配列で補完される(後方互換)', () => {
    const legacy = {
      schemaVersion: 1,
      pages: [{ id: 'p1', name: 'ホーム', path: '/', root: ComponentNode.create('container'), useHeader: true, useFooter: true }],
      layout: { header: null, footer: null },
      dialogs: [],
    };
    const doc = unwrap(parseProjectDoc(legacy));
    expect(doc.channels).toEqual([]);
  });

  it('channelRef を持つ部品は登録簿のチャネル設定で生成される(inline より優先)', () => {
    let doc = ProjectDoc.create();
    const added = ProjectDoc.addChannel(doc, '温度', {
      key: 'temp',
      source: 'modbus',
      min: 0,
      max: 200,
      interval: 800,
      host: '10.0.0.9:502',
      unit: 3,
      register: 7,
      scale: 0.1,
    });
    doc = added.doc;
    const home = doc.pages[0]!;
    // inline は mock/cpu だが channelRef で temp(modbus)を参照
    const gauge = ComponentNode.create('gauge', {
      label: '炉温',
      unit: '℃',
      source: 'mock',
      channel: 'cpu',
      min: 0,
      max: 100,
      interval: 1000,
      channelRef: added.channel.id,
    });
    const root = unwrap(ComponentNode.insert(home.root, home.root.id, 0, gauge));
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);

    const page = generateProject(doc, 'x').find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    // チャネル定義(modbus/temp/0..200/800ms + Modbus パラメータ)が解決されている
    expect(page).toContain('source={"modbus"}');
    expect(page).toContain('channel={"temp"}');
    expect(page).toContain('min={0}');
    expect(page).toContain('max={200}');
    expect(page).toContain('interval={800}');
    expect(page).toContain('host={"10.0.0.9:502"}');
    expect(page).toContain('unitId={3}');
    expect(page).toContain('register={7}');
    expect(page).toContain('scale={0.1}');
  });

  it('channelRef 未設定の部品は inline props で生成される(後方互換)', () => {
    let doc = ProjectDoc.create();
    const home = doc.pages[0]!;
    const metric = ComponentNode.create('metric', {
      label: 'CPU', unit: '%', source: 'live', channel: 'cpu', min: 0, max: 100, interval: 1000, decimals: 0,
    });
    const root = unwrap(ComponentNode.insert(home.root, home.root.id, 0, metric));
    doc = ProjectDoc.setTree(doc, EditTarget.page(home.id), root);
    const page = generateProject(doc, 'x').find((f) => f.path === 'src/pages/Page0.tsx')!.content;
    expect(page).toContain('source={"live"}');
    expect(page).toContain('channel={"cpu"}');
  });
});
