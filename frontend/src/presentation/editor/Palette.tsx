import { paletteDefs } from '@/domain/catalog/component-defs';
import { CustomPartId } from '@/domain/ids';
import { customPartRemoved } from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DragPayload, useEditInteraction } from './edit-interaction';

export function Palette() {
  const ctx = useEditInteraction();
  const dispatch = useAppDispatch();
  const customParts = useAppSelector((s) => s.editor.doc.customParts);

  return (
    <section className="panel-section">
      <h3>パーツ</h3>
      <div className="palette-grid">
        {paletteDefs.map((def) => (
          <div
            key={def.type}
            className="palette-item"
            draggable
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
                title="ドラッグして配置(深いコピーが挿入されます)"
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
