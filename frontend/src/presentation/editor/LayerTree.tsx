import type { ComponentNode } from '@/domain/component-node';
import { ProjectDoc } from '@/domain/project-doc';
import { componentDefs } from '@/domain/catalog/component-defs';
import { nodeSummaryLabel } from '../renderer/NodeRenderer';
import { nodeRemoved, nodeSelected } from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

type Row = Readonly<{ node: ComponentNode; depth: number }>;

const flatten = (node: ComponentNode, depth: number, out: Row[]): Row[] => {
  out.push({ node, depth });
  for (const child of node.children) flatten(child, depth + 1, out);
  return out;
};

export function LayerTree() {
  const dispatch = useAppDispatch();
  const doc = useAppSelector((s) => s.editor.doc);
  const target = useAppSelector((s) => s.editor.editTarget);
  const selectedId = useAppSelector((s) => s.editor.selectedNodeId);
  const tree = ProjectDoc.getTree(doc, target);
  if (!tree) return null;

  const rows = flatten(tree, 0, []);
  return (
    <section className="panel-section layer-tree">
      <h3>レイヤー</h3>
      {rows.map(({ node, depth }) => (
        <div
          key={node.id}
          className={`layer-row${selectedId === node.id ? ' active' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => dispatch(nodeSelected(node.id))}
        >
          <span className="layer-label">
            <span className="layer-icon">{componentDefs[node.type].icon}</span>
            {nodeSummaryLabel(node)}
          </span>
          {depth > 0 && (
            <button
              type="button"
              className="icon-btn"
              title="削除"
              onClick={(e) => {
                e.stopPropagation();
                dispatch(nodeRemoved({ nodeId: node.id }));
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
