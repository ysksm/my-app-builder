import type { IfField, IfFieldType, IfOperation, InterfaceModel } from './interface-model';

/**
 * TypeSpec アダプタ(export)。中立 I/F モデル → TypeSpec ソース(main.tsp)。
 * requirements.md §5: アダプタは中立モデルを入出力する。第1弾は TypeSpec の export を先行実装。
 */

const tsType = (t: IfFieldType): string => {
  if (t.kind === 'ref') return t.dto;
  switch (t.scalar) {
    case 'string':
      return 'string';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'boolean';
  }
};

const fieldLine = (f: IfField): string => {
  const base = tsType(f.type) + (f.array ? '[]' : '');
  return `  ${f.name}${f.optional ? '?' : ''}: ${base};`;
};

const opLine = (op: IfOperation): string => {
  const params: string[] = [];
  for (const p of op.pathParams) params.push(`@path ${p}: string`);
  if (op.bodyDto) params.push(`@body body: ${op.bodyDto}`);
  const ret = op.responseDto
    ? op.responseDto + (op.responseArray ? '[]' : '')
    : 'void';
  return `  @route("${op.path}") @${op.method} ${op.id}(${params.join(', ')}): ${ret};`;
};

/** namespace 名は英数字のみに正規化(TypeSpec 識別子) */
const toNamespace = (title: string): string => {
  const cleaned = title.replace(/[^A-Za-z0-9]+/g, '');
  const pascal = cleaned ? cleaned[0]!.toUpperCase() + cleaned.slice(1) : '';
  return /^[A-Za-z]/.test(pascal) ? pascal : `App${pascal}`;
};

export const emitTypeSpec = (model: InterfaceModel): string => {
  const ns = toNamespace(model.serviceTitle);
  const models = model.dtos
    .map((d) => `model ${d.name} {\n${d.fields.map(fieldLine).join('\n')}\n}`)
    .join('\n\n');
  const ops = model.operations.map(opLine).join('\n');

  return `// 自動生成 — AppForge: 中立 I/F モデルからの TypeSpec export(requirements.md §5)
import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: ${JSON.stringify(model.serviceTitle)} })
namespace ${ns};

${models}

interface Api {
${ops}
}
`;
};
