import type { DataModel, ModelDef } from '@/domain/data-model';
import type { ProjectDoc } from '@/domain/project-doc';
import { deriveInterfaceModel, resourcePath } from '@/generator/interface-model';
import { collectScreenFlow } from './screen-flow';

/**
 * 設計図エクスポート(FR-VIEW-06)。中立ドキュメントモデルから図・表を導出するため
 * 実装と図が乖離しない。Mermaid(図)+ Markdown(表)で出力し、MCP からも取得できる。
 */

const sanitizeId = (prefix: string, index: number): string => `${prefix}${index}`;
const esc = (s: string): string => s.replace(/"/g, '#quot;');

// ---------- 1. 画面遷移図 ----------

export const screenFlowMermaid = (doc: ProjectDoc): string => {
  const flow = collectScreenFlow(doc);
  const idOf = new Map(flow.screens.map((s, i) => [s.id, sanitizeId('s', i)] as const));
  const lines = ['flowchart LR'];
  for (const s of flow.screens) {
    const node = idOf.get(s.id)!;
    const label = s.path ? `${s.title} ${s.path}` : s.title;
    lines.push(s.kind === 'page' ? `  ${node}["${esc(label)}"]` : `  ${node}{{"${esc(label)}"}}`);
  }
  for (const e of flow.edges) {
    const from = idOf.get(e.from);
    const to = idOf.get(e.to);
    if (!from || !to) continue;
    const arrow = e.action === 'openDialog' ? '-.->' : '-->';
    lines.push(`  ${from} ${arrow}|${esc(e.trigger)}| ${to}`);
  }
  if (flow.edges.length === 0) lines.push('  %% 画面遷移はまだ定義されていません');
  return lines.join('\n');
};

// ---------- 2. ユースケースのシーケンス図 ----------

const usecaseSequence = (model: ModelDef, usecaseName: string, serviceNames: string[], save: boolean): string => {
  const lines = [
    `sequenceDiagram`,
    `  participant UI`,
    `  participant App as ${usecaseName} (application)`,
    `  participant Dom as ${model.name} (domain)`,
  ];
  if (serviceNames.length > 0) lines.push(`  participant Svc as domain services`);
  if (save) lines.push(`  participant Repo as ${model.name}Repository (infra)`);
  lines.push(`  UI->>App: ${usecaseName}(input)`);
  lines.push(`  App->>Dom: ${model.name}.create(input)`);
  lines.push(`  Dom-->>App: Result<${model.name}>`);
  for (const svc of serviceNames) {
    lines.push(`  App->>Svc: ${svc}(entity)`);
    lines.push(`  Svc-->>App: ${model.name}`);
  }
  if (save) {
    lines.push(`  App->>Repo: save(entity)`);
    lines.push(`  Repo-->>App: Result<${model.name}>`);
  }
  lines.push(`  App-->>UI: Result<${model.name}>`);
  return lines.join('\n');
};

export const usecaseSequencesMermaid = (dm: DataModel): ReadonlyArray<{ title: string; mermaid: string }> => {
  const out: { title: string; mermaid: string }[] = [];
  for (const model of dm.models) {
    if (model.kind !== 'aggregate') continue;
    const serviceName = new Map(model.services.map((s) => [s.id, s.name] as const));
    for (const uc of model.usecases) {
      const svcNames = uc.serviceIds.map((id) => serviceName.get(id)).filter((n): n is string => !!n);
      out.push({
        title: `${model.name}.${uc.name}`,
        mermaid: usecaseSequence(model, uc.name, svcNames, uc.save),
      });
    }
  }
  return out;
};

// ---------- 3. レイヤー × 機能 トレーサビリティマトリクス ----------

export const traceabilityMatrix = (doc: ProjectDoc): string => {
  const dm = doc.dataModel;
  const aggregates = dm.models.filter((m) => m.kind === 'aggregate');
  if (aggregates.length === 0) return '機能(集約)が定義されていません。';

  const ifModel = deriveInterfaceModel(dm, 'API');
  const byId = new Map(dm.models.map((m) => [m.id, m] as const));

  const rows = aggregates.map((agg) => {
    const related = dm.relations
      .filter((r) => r.from === agg.id)
      .map((r) => byId.get(r.to)?.name)
      .filter((n): n is string => !!n);
    const ui = `管理画面(${agg.name}AdminPage)`;
    const usecases = [`create/list/remove${agg.name}`, ...agg.usecases.map((u) => u.name)].join(', ');
    const domain = [
      agg.name,
      ...related,
      ...agg.services.map((s) => `${s.name}()`),
    ].join(', ');
    const infra = `${agg.name}Repository(mock/api)`;
    const api = ifModel.operations
      .filter((o) => o.path.startsWith(resourcePath(agg)))
      .map((o) => o.id)
      .join(', ');
    return `| ${agg.name} | ${ui} | ${usecases} | ${domain} | ${infra} | ${api} |`;
  });

  return [
    '| 機能 | UI | アプリケーション層 | ドメイン層 | インフラ | API |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
};

// ---------- まとめ ----------

export type DiagramKind = 'screen-flow' | 'sequence' | 'traceability';

export const exportDiagram = (doc: ProjectDoc, kind: DiagramKind): string => {
  switch (kind) {
    case 'screen-flow':
      return screenFlowMermaid(doc);
    case 'sequence': {
      const seqs = usecaseSequencesMermaid(doc.dataModel);
      if (seqs.length === 0) return '%% ユースケースが定義されていません(モデルでユースケースを追加してください)';
      return seqs.map((s) => `%% ${s.title}\n${s.mermaid}`).join('\n\n');
    }
    case 'traceability':
      return traceabilityMatrix(doc);
  }
};
