import { describe, expect, it } from 'vitest';
import { ComponentNode } from './component-node';
import { CustomPartId } from './ids';
import { ProjectDoc } from './project-doc';
import { parseProjectDoc } from './schema';

const buildSubtree = () => {
  const box = ComponentNode.create('container');
  const input = ComponentNode.create('input', { label: '検索' });
  const button = ComponentNode.create('button', { label: '実行' });
  let root = box;
  root = (ComponentNode.insert(root, root.id, 0, input) as { ok: true; value: ComponentNode }).value;
  root = (ComponentNode.insert(root, root.id, 1, button) as { ok: true; value: ComponentNode }).value;
  return root;
};

describe('ComponentNode.clone', () => {
  it('深いコピーで全ノードに新しい ID を振る', () => {
    const root = buildSubtree();
    const clone = ComponentNode.clone(root);
    expect(clone.id).not.toBe(root.id);
    expect(clone.children[0]!.id).not.toBe(root.children[0]!.id);
    // 構造・props は同一
    expect(clone.children.map((c) => c.type)).toEqual(root.children.map((c) => c.type));
    expect(clone.children[0]!.props['label']).toBe('検索');
  });
});

describe('ProjectDoc カスタムパーツ', () => {
  it('登録・改名・削除でき、テンプレートは独立 ID(元の木と別)', () => {
    const doc = ProjectDoc.create();
    const subtree = buildSubtree();
    const { doc: doc2, part } = ProjectDoc.addCustomPart(doc, '検索バー', subtree);
    expect(part.name).toBe('検索バー');
    expect(part.root.id).not.toBe(subtree.id); // clone されている
    expect(doc2.customParts).toHaveLength(1);

    const renamed = ProjectDoc.renameCustomPart(doc2, part.id, 'サーチ');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.value.customParts[0]!.name).toBe('サーチ');

    const removed = ProjectDoc.removeCustomPart(renamed.value, part.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.customParts).toHaveLength(0);
  });

  it('空名はデフォルト名で補完される', () => {
    const { part } = ProjectDoc.addCustomPart(ProjectDoc.create(), '   ', buildSubtree());
    expect(part.name).toBe('パーツ1');
  });

  it('customParts を持たない旧ドキュメントは空配列で補完される', () => {
    const doc = ProjectDoc.create();
    const legacy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    delete legacy['customParts'];
    const parsed = parseProjectDoc(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.customParts).toEqual([]);
  });

  it('未知のパーツ削除は NOT_FOUND', () => {
    const res = ProjectDoc.removeCustomPart(ProjectDoc.create(), CustomPartId.from('x'));
    expect(res.ok).toBe(false);
  });
});
