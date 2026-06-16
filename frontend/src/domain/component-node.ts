import { err, ok, type Result } from '@/shared/result';
import type { EventBinding } from './actions';
import { DomainError } from './errors';
import { NodeId } from './ids';

export type PropValue = string | number | boolean;

/** グリッドレイアウト上の配置(ToolJet 風)。親コンテナが layoutMode='grid' のときのみ有効。
 * 単位はグリッドセル(x,w は列 0..NCOLS、y,h は行)。未設定の子は描画時に自動整列される。 */
export type GridLayout = Readonly<{ x: number; y: number; w: number; h: number }>;

/** ノード個別のスタイル(主に flex アイテムのサイズ・自己整列)。キーは camelCase の CSS
 * プロパティ名(width / height / flexGrow / alignSelf / margin…)、値は CSS 値または数値。
 * 空 = 未設定。css-variables emitter は inline style、tailwind emitter はクラスへ落とす。 */
export type NodeStyle = Readonly<Record<string, string | number>>;

export type ComponentType =
  | 'container'
  | 'heading'
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'table'
  | 'header'
  | 'footer'
  | 'metric'
  | 'gauge'
  | 'lamp'
  | 'chart'
  | 'setpoint'
  // 外部ライブラリ製コンポーネント(vanilla JS、4FW + ビルダー共通)
  | 'uplot'
  | 'echarts'
  | 'aggrid'
  // フォーム(入力をまとめて submit。acceptsChildren)
  | 'form'
  // 対話部品(plain は <details> でステートレス、UIライブラリ選択時は kit の部品)
  | 'disclosure'
  | 'menu'
  | 'switch'
  | 'tabs'
  // UIライブラリ固有部品(MUI など。plain フォールバックあり)
  | 'rating'
  | 'slider'
  | 'chip'
  | 'alert'
  | 'badge'
  | 'avatar'
  | 'combobox'
  // UIライブラリ固有部品(React Aria)
  | 'progress'
  | 'searchfield';

export type ComponentNode = Readonly<{
  id: NodeId;
  type: ComponentType;
  props: Readonly<Record<string, PropValue>>;
  events: ReadonlyArray<EventBinding>;
  children: ReadonlyArray<ComponentNode>;
  /** 親がグリッドレイアウトのときの配置。それ以外では無視される(任意) */
  layout?: GridLayout;
  /** ノード個別のスタイル(flex アイテムのサイズ・自己整列など。任意) */
  style?: NodeStyle;
  /** 任意の追加クラス(Tailwind 等のエスケープハッチ。構造化できないユーティリティ用。任意) */
  className?: string;
}>;

const insertAt = <T>(items: ReadonlyArray<T>, index: number, item: T): ReadonlyArray<T> => {
  const i = Math.max(0, Math.min(items.length, index));
  return [...items.slice(0, i), item, ...items.slice(i)];
};

/** id に一致するノードを f で置き換えた新しい木を返す(見つからなければ同一の木) */
const mapNode = (
  root: ComponentNode,
  id: NodeId,
  f: (node: ComponentNode) => ComponentNode,
): ComponentNode => {
  if (root.id === id) return f(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = mapNode(child, id, f);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
};

export const ComponentNode = {
  create(type: ComponentType, props: Record<string, PropValue> = {}): ComponentNode {
    return { id: NodeId.create(), type, props, events: [], children: [] };
  },

  /** 深いコピー。すべてのノードに新しい ID を振る(複合パーツの登録・挿入で使う) */
  clone(node: ComponentNode): ComponentNode {
    return {
      ...node,
      id: NodeId.create(),
      events: node.events.map((e) => ({ ...e })),
      children: node.children.map(ComponentNode.clone),
    };
  },

  find(root: ComponentNode, id: NodeId): ComponentNode | null {
    if (root.id === id) return root;
    for (const child of root.children) {
      const found = ComponentNode.find(child, id);
      if (found) return found;
    }
    return null;
  },

  findParent(root: ComponentNode, id: NodeId): ComponentNode | null {
    for (const child of root.children) {
      if (child.id === id) return root;
      const found = ComponentNode.findParent(child, id);
      if (found) return found;
    }
    return null;
  },

  contains(root: ComponentNode, id: NodeId): boolean {
    return ComponentNode.find(root, id) !== null;
  },

  /** 木の全ノードに f を適用した新しい木を返す(参照整合性の掃除などに使う) */
  mapEvery(root: ComponentNode, f: (node: ComponentNode) => ComponentNode): ComponentNode {
    const mapped = f(root);
    return { ...mapped, children: mapped.children.map((c) => ComponentNode.mapEvery(c, f)) };
  },

  insert(
    root: ComponentNode,
    parentId: NodeId,
    index: number,
    node: ComponentNode,
  ): Result<ComponentNode, DomainError> {
    if (!ComponentNode.contains(root, parentId)) return err(DomainError.notFound('parent node'));
    return ok(
      mapNode(root, parentId, (p) => ({ ...p, children: insertAt(p.children, index, node) })),
    );
  },

  remove(root: ComponentNode, id: NodeId): Result<ComponentNode, DomainError> {
    if (root.id === id) return err(DomainError.create('INVALID', 'cannot remove root node'));
    if (!ComponentNode.contains(root, id)) return err(DomainError.notFound('node'));
    const parent = ComponentNode.findParent(root, id);
    if (!parent) return err(DomainError.notFound('parent node'));
    return ok(
      mapNode(root, parent.id, (p) => ({
        ...p,
        children: p.children.filter((c) => c.id !== id),
      })),
    );
  },

  move(
    root: ComponentNode,
    id: NodeId,
    newParentId: NodeId,
    index: number,
  ): Result<ComponentNode, DomainError> {
    const node = ComponentNode.find(root, id);
    if (!node) return err(DomainError.notFound('node'));
    if (id === newParentId || ComponentNode.contains(node, newParentId)) {
      return err(DomainError.create('CYCLE', 'cannot move a node into its own subtree'));
    }
    const newParent = ComponentNode.find(root, newParentId);
    if (!newParent) return err(DomainError.notFound('parent node'));

    const currentParent = ComponentNode.findParent(root, id);
    let targetIndex = index;
    if (currentParent && currentParent.id === newParentId) {
      const currentIndex = currentParent.children.findIndex((c) => c.id === id);
      if (currentIndex >= 0 && currentIndex < index) targetIndex = index - 1;
    }
    const removed = ComponentNode.remove(root, id);
    if (!removed.ok) return removed;
    return ComponentNode.insert(removed.value, newParentId, targetIndex, node);
  },

  updateProps(
    root: ComponentNode,
    id: NodeId,
    patch: Record<string, PropValue>,
  ): Result<ComponentNode, DomainError> {
    if (!ComponentNode.contains(root, id)) return err(DomainError.notFound('node'));
    return ok(mapNode(root, id, (n) => ({ ...n, props: { ...n.props, ...patch } })));
  },

  setEvents(
    root: ComponentNode,
    id: NodeId,
    events: ReadonlyArray<EventBinding>,
  ): Result<ComponentNode, DomainError> {
    if (!ComponentNode.contains(root, id)) return err(DomainError.notFound('node'));
    return ok(mapNode(root, id, (n) => ({ ...n, events })));
  },

  setLayout(
    root: ComponentNode,
    id: NodeId,
    layout: GridLayout,
  ): Result<ComponentNode, DomainError> {
    if (!ComponentNode.contains(root, id)) return err(DomainError.notFound('node'));
    return ok(mapNode(root, id, (n) => ({ ...n, layout })));
  },

  /** style をパッチマージする。値が空文字のキーは削除(未設定に戻す) */
  setStyle(
    root: ComponentNode,
    id: NodeId,
    patch: NodeStyle,
  ): Result<ComponentNode, DomainError> {
    if (!ComponentNode.contains(root, id)) return err(DomainError.notFound('node'));
    return ok(
      mapNode(root, id, (n) => {
        const merged: Record<string, string | number> = { ...(n.style ?? {}), ...patch };
        const cleaned = Object.fromEntries(
          Object.entries(merged).filter(([, v]) => v !== '' && v !== undefined),
        );
        return { ...n, style: cleaned };
      }),
    );
  },

  /** 任意クラスを設定する。空文字なら className を外す */
  setClassName(
    root: ComponentNode,
    id: NodeId,
    className: string,
  ): Result<ComponentNode, DomainError> {
    if (!ComponentNode.contains(root, id)) return err(DomainError.notFound('node'));
    const trimmed = className.trim();
    return ok(
      mapNode(root, id, (n) => {
        const next = { ...n };
        if (trimmed) next.className = trimmed;
        else delete next.className;
        return next;
      }),
    );
  },
} as const;
