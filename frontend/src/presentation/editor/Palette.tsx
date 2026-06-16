import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { paletteDefs } from '@/domain/catalog/component-defs';
import type { ComponentType } from '@/domain/component-node';
import { CustomPartId } from '@/domain/ids';
import { ProjectDoc } from '@/domain/project-doc';
import { customPartInserted, customPartRemoved, nodeInserted } from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DragPayload, useEditInteraction } from './edit-interaction';

export function Palette() {
  const ctx = useEditInteraction();
  const dispatch = useAppDispatch();
  const customParts = useAppSelector((s) => s.editor.doc.customParts);
  // 選択中フレームワークの UIライブラリ。固有部品(def.kit)はその kit のときだけ出す
  const currentKit = useAppSelector((s) => s.editor.doc.uiKits[s.editor.doc.targetFramework] ?? 'plain');
  // 現在の編集対象ツリー(キーボード操作で末尾に追加する先)
  const tree = useAppSelector((s) => ProjectDoc.getTree(s.editor.doc, s.editor.editTarget));
  const defs = paletteDefs.filter((def) => !def.kit || def.kit === currentKit);

  // キーボード(Enter/Space)で編集対象の末尾に追加
  const addComponent = (type: ComponentType) => {
    if (tree) dispatch(nodeInserted({ parentId: tree.id, index: tree.children.length, type }));
  };
  const addCustom = (partId: string) => {
    if (tree) dispatch(customPartInserted({ parentId: tree.id, index: tree.children.length, partId: CustomPartId.from(partId) }));
  };
  const activateKey = (e: ReactKeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  return (
    <section className="panel-section">
      <h3>パーツ</h3>
      <div className="palette-grid">
        {defs.map((def) => (
          <div
            key={def.type}
            className="palette-item"
            draggable
            role="button"
            tabIndex={0}
            aria-label={`${def.label} を追加`}
            onKeyDown={(e) => activateKey(e, () => addComponent(def.type))}
            onDragStart={(e) => {
              DragPayload.write(e, { kind: 'new', type: def.type });
              ctx.onDragStart();
            }}
            onDragEnd={ctx.onDragEnd}
          >
            <span className="palette-icon">{def.icon}</span>
            <span>{def.label}</span>
          </div>
        ))}
      </div>

      {customParts.length > 0 && (
        <>
          <h3>カスタムパーツ</h3>
          <div className="palette-custom">
            {customParts.map((part) => (
              <div
                key={part.id}
                className="palette-item custom"
                draggable
                role="button"
                tabIndex={0}
                aria-label={`${part.name} を追加`}
                title="ドラッグして配置(深いコピーが挿入されます)"
                onKeyDown={(e) => activateKey(e, () => addCustom(part.id))}
                onDragStart={(e) => {
                  DragPayload.write(e, { kind: 'custom', partId: part.id });
                  ctx.onDragStart();
                }}
                onDragEnd={ctx.onDragEnd}
              >
                <span className="palette-icon">◳</span>
                <span className="palette-custom-name">{part.name}</span>
                <button
                  type="button"
                  className="icon-btn"
                  title="パーツ定義を削除"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(customPartRemoved({ partId: CustomPartId.from(part.id) }));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
