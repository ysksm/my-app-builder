import { useEffect, useMemo, useState } from 'react';
import { CustomPartId, NodeId } from '@/domain/ids';
import {
  customPartInserted,
  nodeInserted,
  nodeMoved,
  nodeRemoved,
  nodeSelected,
  redone,
  undone,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { EditInteractionContext, type EditInteraction } from './edit-interaction';
import { Canvas } from './Canvas';
import { LayerTree } from './LayerTree';
import { PagesPanel } from './PagesPanel';
import { Palette } from './Palette';
import { PropertyPanel } from './PropertyPanel';

export function EditorPage() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.editor.selectedNodeId);
  const [dragging, setDragging] = useState(false);

  const interaction = useMemo<EditInteraction>(
    () => ({
      selectedId,
      dragging,
      onSelect: (id) => dispatch(nodeSelected(id)),
      onDragStart: () => setDragging(true),
      onDragEnd: () => setDragging(false),
      onDrop: (parentId, index, payload) => {
        setDragging(false);
        if (payload.kind === 'new') {
          dispatch(nodeInserted({ parentId, index, type: payload.type }));
        } else if (payload.kind === 'custom') {
          dispatch(customPartInserted({ parentId, index, partId: CustomPartId.from(payload.partId) }));
        } else {
          dispatch(nodeMoved({ nodeId: NodeId.from(payload.nodeId), parentId, index }));
        }
      },
    }),
    [selectedId, dragging, dispatch],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = e.target instanceof HTMLElement ? e.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch(e.shiftKey ? redone() : undone());
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        dispatch(nodeRemoved({ nodeId: selectedId }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, selectedId]);

  return (
    <EditInteractionContext.Provider value={interaction}>
      <div className="editor-grid">
        <aside className="panel panel-left">
          <Palette />
          <PagesPanel />
        </aside>
        <Canvas />
        <aside className="panel panel-right">
          <LayerTree />
          <PropertyPanel />
        </aside>
      </div>
    </EditInteractionContext.Provider>
  );
}
