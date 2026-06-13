import type { IfField, IfFieldType, IfOperation, InterfaceModel } from './interface-model';

/**
 * OpenAPI アダプタ(export)。中立 I/F モデル → OpenAPI 3.0.3 ドキュメント(JSON)。
 * requirements.md §5 / FR-IF-00: I/F は中立モデルを単一ソースとし、アダプタが各 IDL を出力する。
 * TypeSpec(第1弾)に続く第2実装。コネクタの Modbus と同様、中立表現の妥当性を示す。
 */

type JsonSchema = Record<string, unknown>;

const ref = (dto: string): JsonSchema => ({ $ref: `#/components/schemas/${dto}` });

const scalarSchema = (t: IfFieldType): JsonSchema => {
  if (t.kind === 'ref') return ref(t.dto);
  switch (t.scalar) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
  }
};

const fieldSchema = (f: IfField): JsonSchema => {
  const inner = scalarSchema(f.type);
  return f.array ? { type: 'array', items: inner } : inner;
};

const dtoSchema = (fields: ReadonlyArray<IfField>): JsonSchema => {
  const properties: Record<string, JsonSchema> = {};
  for (const f of fields) properties[f.name] = fieldSchema(f);
  const required = fields.filter((f) => !f.optional).map((f) => f.name);
  const schema: JsonSchema = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  return schema;
};

const responseSchema = (op: IfOperation): JsonSchema => {
  const inner = ref(op.responseDto!);
  return op.responseArray ? { type: 'array', items: inner } : inner;
};

/** 1オペレーション → OpenAPI の operation オブジェクト */
const operationObject = (op: IfOperation): JsonSchema => {
  const obj: JsonSchema = { operationId: op.id, summary: op.summary };

  if (op.pathParams.length > 0) {
    obj.parameters = op.pathParams.map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
  }

  if (op.bodyDto) {
    obj.requestBody = {
      required: true,
      content: { 'application/json': { schema: ref(op.bodyDto) } },
    };
  }

  // 成功ステータス: 作成=201 / 応答なし=204 / それ以外=200
  const status = op.method === 'post' ? '201' : op.responseDto ? '200' : '204';
  const response: JsonSchema = { description: op.summary };
  if (op.responseDto) {
    response.content = { 'application/json': { schema: responseSchema(op) } };
  }
  const responses: JsonSchema = { [status]: response };
  // エラー応答: パスパラメータあり=404 / ボディあり=400(自動導出の妥当な既定)
  if (op.pathParams.length > 0) responses['404'] = { description: 'Not found' };
  if (op.bodyDto) responses['400'] = { description: 'Invalid input' };
  obj.responses = responses;
  return obj;
};

export const emitOpenApi = (model: InterfaceModel): string => {
  // パスごとにメソッドをまとめる(中立モデルの登場順を保つ)
  const paths: Record<string, Record<string, JsonSchema>> = {};
  const order: string[] = [];
  for (const op of model.operations) {
    if (!paths[op.path]) {
      paths[op.path] = {};
      order.push(op.path);
    }
    paths[op.path]![op.method] = operationObject(op);
  }
  const orderedPaths: Record<string, Record<string, JsonSchema>> = {};
  for (const p of order) orderedPaths[p] = paths[p]!;

  const schemas: Record<string, JsonSchema> = {};
  for (const dto of model.dtos) schemas[dto.name] = dtoSchema(dto.fields);

  const doc = {
    openapi: '3.0.3',
    info: { title: model.serviceTitle, version: '1.0.0' },
    // 生成アプリの API クライアント既定ベース(VITE_API_BASE)と一致
    servers: [{ url: '/api' }],
    paths: orderedPaths,
    components: { schemas },
  };

  return JSON.stringify(doc, null, 2) + '\n';
};
