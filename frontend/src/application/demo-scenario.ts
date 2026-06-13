import { EditTarget, ProjectDoc } from '@/domain/project-doc';
import { applyCommand, type Command, type CommandOutcome } from './commands';

/**
 * デモシナリオ(FR-DEMO / §7.4)。ビルダー自体を見せるため、サンプルアプリ
 * (サーバー監視ダッシュボード)をコマンド層で1ステップずつ組み立て、各時点の
 * ドキュメントスナップショットを返す。GUI でも MCP でも通る同じコマンド層を使うので、
 * 「宣言的に積み上げると動くアプリになる」様子をそのまま再生できる。
 *
 * 純粋関数。プレイヤー(DemoView)はスナップショットを順に描画するだけで、
 * ユーザーの実プロジェクト(editor slice の doc)には一切触れない。
 */
export type DemoStep = Readonly<{ narration: string; doc: ProjectDoc }>;

const apply = (doc: ProjectDoc, cmd: Command): CommandOutcome => {
  const r = applyCommand(doc, cmd);
  if (!r.ok) throw new Error(`demo command failed: ${JSON.stringify(cmd)}`);
  return r.value;
};

export function buildDemoSteps(): DemoStep[] {
  const steps: DemoStep[] = [];
  let doc = ProjectDoc.create();
  const homeId = doc.pages[0]!.id;
  const target = EditTarget.page(homeId);
  const rootId = () => ProjectDoc.getTree(doc, target)!.id;
  const record = (narration: string) => steps.push({ narration, doc });

  record(
    '空のプロジェクトから始めます。これ以降の操作はすべて「コマンド層」を通ります — GUI 操作も MCP からの操作も同じ経路です。',
  );

  // 見出し
  {
    const out = apply(doc, { kind: 'insertNode', target, parentId: rootId(), index: 0, type: 'heading' });
    doc = out.doc;
    doc = apply(doc, {
      kind: 'updateNodeProps',
      target,
      nodeId: out.created.nodeId!,
      patch: { text: 'サーバー監視ダッシュボード', level: 1 },
    }).doc;
    record('見出しを1つ置きました。ドラッグ&ドロップで配置するのと同じ操作です。');
  }

  // データチャネルを登録
  let cpuChannel: string;
  {
    const out = apply(doc, {
      kind: 'addChannel',
      name: 'CPU 使用率',
      patch: { key: 'cpu', source: 'mock', min: 0, max: 100, interval: 800 },
    });
    doc = out.doc;
    cpuChannel = out.created.channelId!;
    record(
      'データチャネル「CPU 使用率」を登録しました。コネクタ設定(mock / WebSocket / Modbus)をここに集約し、部品はこのチャネルを参照するだけにします。',
    );
  }

  // 数値カード(チャネル参照 + しきい値)
  {
    const out = apply(doc, { kind: 'insertNode', target, parentId: rootId(), index: 1, type: 'metric' });
    doc = out.doc;
    doc = apply(doc, {
      kind: 'updateNodeProps',
      target,
      nodeId: out.created.nodeId!,
      patch: { label: 'CPU', unit: '%', channelRef: cpuChannel, warnAbove: 70, critAbove: 90 },
    }).doc;
    record(
      '数値カードを追加し、先ほどのチャネルを参照させました。しきい値(警告 70 / 危険 90)を超えると色が変わり、トーストとイベントが発火します。',
    );
  }

  // ゲージ(同じチャネルを別表現で)
  {
    const out = apply(doc, { kind: 'insertNode', target, parentId: rootId(), index: 2, type: 'gauge' });
    doc = out.doc;
    doc = apply(doc, {
      kind: 'updateNodeProps',
      target,
      nodeId: out.created.nodeId!,
      patch: { label: 'CPU', unit: '%', channelRef: cpuChannel, warnAbove: 70, critAbove: 90 },
    }).doc;
    record('同じチャネルをゲージでも表示。1つのデータ源を複数の見せ方で共有できます。');
  }

  // チャート(時系列)
  {
    const out = apply(doc, { kind: 'insertNode', target, parentId: rootId(), index: 3, type: 'chart' });
    doc = out.doc;
    doc = apply(doc, {
      kind: 'updateNodeProps',
      target,
      nodeId: out.created.nodeId!,
      patch: { label: 'CPU トレンド', unit: '%', channelRef: cpuChannel, capacity: 40 },
    }).doc;
    record('スパークラインチャートで時系列も。ここまでコードは一行も書いていません。');
  }

  record(
    '完成です。このままコード生成すれば、Vite + React + Redux + React Router の、ビルドして動くソース一式になります。',
  );

  return steps;
}
