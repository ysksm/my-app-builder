import { createContext, useContext, type DragEvent } from 'react';
import type { ComponentType, GridLayout } from '@/domain/component-node';
import type { NodeId } from '@/domain/ids';

export const DRAG_MIME = 'application/x-appforge';

export type DragPayload =
  | Readonly<{ kind: 'new'; type: ComponentType }>
  | Readonly<{ kind: 'move'; nodeId: string }>
  | Readonly<{ kind: 'custom'; partId: string }>;

export const DragPayload = {
  write(e: DragEvent, payload: DragPayload): void {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = payload.kind === 'new' ? 'copy' : 'move';
  },

  read(e: DragEvent): DragPayload | null {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  },

  /** drop 前(dragover)は中身を読めないため、型の有無だけで判定する */
  isPresent(e: DragEvent): boolean {
    return e.dataTransfer.types.includes(DRAG_MIME);
  },
} as const;

export type EditInteraction = Readonly<{
  selectedId: NodeId | null;
  dragging: boolean;
  onSelect: (id: NodeId) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (parentId: NodeId, index: number, payload: DragPayload) => void;
  /** グリッドレイアウト上でノードの配置を更新する(ポインタ移動・リサイズの確定時) */
  onLayout: (nodeId: NodeId, layout: GridLayout) => void;
}>;

export const EditInteractionContext = createContext<EditInteraction | null>(null);

export const useEditInteraction = (): EditInteraction => {
  const ctx = useContext(EditInteractionContext);
  if (!ctx) throw new Error('EditInteractionContext is not provided');
  return ctx;
};
