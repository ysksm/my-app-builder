import { paletteDefs } from '../catalog/component-defs';
import { DragPayload, useEditInteraction } from './edit-interaction';

export function Palette() {
  const ctx = useEditInteraction();
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
    </section>
  );
}
