import { err, ok, type Result } from '@/shared/result';
import type { EventBinding } from './actions';
import { DomainError } from './errors';
import { NodeId } from './ids';

export type PropValue = string | number | boolean;

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
  // 対話部品(plain は <details> でステートレス、UIライブラリ選択時は kit の部品)
  | 'disclosure'
  | 'menu'
  | 'switch'
  // UIライブラリ固有部品(MUI など。plain フォールバックあり)
  | 'rating'
  | 'slider'
  | 'chip';

export type ComponentNode = Readonly<{
  id: NodeId;
  type: ComponentType;
  props: Readonly<Record<string, PropValue>>;
  events: ReadonlyArray<EventBinding>;
  children: ReadonlyArray<ComponentNode>;
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
} as const;
