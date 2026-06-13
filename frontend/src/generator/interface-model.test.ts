import { describe, expect, it } from 'vitest';
import { DataModel, type ModelKind } from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import { deriveInterfaceModel } from './interface-model';
import { emitTypeSpec } from './emit-typespec';

const unwrap = <T,>(r: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>): T => {
  if (!r.ok) throw new Error('fixture failed');
  return r.value;
};

const addModel = (dm: DataModel, kind: ModelKind, name: string): { dm: DataModel; id: ModelId } => {
  const a = DataModel.addModel(dm, kind, 0, 0);
  return { dm: unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name })), id: a.model.id };
};

const addField = (
  dm: DataModel,
  modelId: ModelId,
  patch: Parameters<typeof DataModel.updateField>[3],
): DataModel => {
  const f = unwrap(DataModel.addField(dm, modelId));
  return unwrap(DataModel.updateField(f.dataModel, modelId, f.field.id, patch));
};

/** Customer(集約: name, age?)→ Order(エンティティ, 1:N)+ Email(単一VO, 1:1) */
const buildModel = () => {
  let dm = DataModel.empty();
  const customer = addModel(dm, 'aggregate', 'Customer');
  dm = customer.dm;
  const order = addModel(dm, 'entity', 'Order');
  dm = order.dm;
  const email = addModel(dm, 'valueObject', 'Email');
  dm = email.dm;

  dm = addField(dm, customer.id, { name: 'name' });
  dm = addField(dm, customer.id, { name: 'age', type: 'number', required: false });
  dm = addField(dm, email.id, { name: 'value' });
  dm = unwrap(DataModel.addRelation(dm, customer.id, order.id, 'hasMany')).dataModel;
  dm = unwrap(DataModel.addRelation(dm, customer.id, email.id, 'hasOne')).dataModel;
  return dm;
};

describe('deriveInterfaceModel', () => {
  const model = deriveInterfaceModel(buildModel(), 'マイアプリ API');

  it('集約ごとに CRUD の4オペレーションを導出する', () => {
    expect(model.operations.map((o) => o.id)).toEqual([
      'listCustomers',
      'getCustomer',
      'createCustomer',
      'deleteCustomer',
    ]);
    const get = model.operations.find((o) => o.id === 'getCustomer')!;
    expect(get.method).toBe('get');
    expect(get.path).toBe('/customers/{id}');
    expect(get.pathParams).toEqual(['id']);
    const create = model.operations.find((o) => o.id === 'createCustomer')!;
    expect(create.method).toBe('post');
    expect(create.bodyDto).toBe('CustomerInput');
    const del = model.operations.find((o) => o.id === 'deleteCustomer')!;
    expect(del.responseDto).toBeNull();
  });

  it('DTO は id + scalar + 関連(エンティティ=ID配列 / 単一VO=primitive)を持つ', () => {
    const customer = model.dtos.find((d) => d.name === 'Customer')!;
    const byName = new Map(customer.fields.map((f) => [f.name, f]));
    expect(byName.get('id')!.type).toEqual({ kind: 'scalar', scalar: 'string' });
    expect(byName.get('age')!.optional).toBe(true);
    // hasMany エンティティ → ID 文字列の配列
    expect(byName.get('orders')!).toMatchObject({ array: true, type: { kind: 'scalar', scalar: 'string' } });
    // 単一フィールド VO → その primitive を埋め込み
    expect(byName.get('email')!).toMatchObject({ array: false, type: { kind: 'scalar', scalar: 'string' } });
  });

  it('集約がなければ operations は空', () => {
    expect(deriveInterfaceModel(DataModel.empty(), 'x').operations).toHaveLength(0);
  });
});

describe('emitTypeSpec', () => {
  const tsp = emitTypeSpec(deriveInterfaceModel(buildModel(), 'マイアプリ API'));

  it('http import / service / namespace を出力する', () => {
    expect(tsp).toContain(`import "@typespec/http";`);
    expect(tsp).toContain('using TypeSpec.Http;');
    expect(tsp).toContain('@service(#{ title: "マイアプリ API" })');
    // 日本語混じりタイトルでも有効な namespace 識別子に正規化(非英数字は除去)
    expect(tsp).toContain('namespace API;');
  });

  it('model と CRUD operation を TypeSpec 構文で出力する', () => {
    expect(tsp).toContain('model Customer {');
    expect(tsp).toContain('  orders: string[];');
    expect(tsp).toContain('  age?: float64;');
    expect(tsp).toContain('model CustomerInput {');
    expect(tsp).toContain('@route("/customers") @get listCustomers(): Customer[];');
    expect(tsp).toContain('@route("/customers/{id}") @get getCustomer(@path id: string): Customer;');
    expect(tsp).toContain('@route("/customers") @post createCustomer(@body body: CustomerInput): Customer;');
    expect(tsp).toContain('@route("/customers/{id}") @delete deleteCustomer(@path id: string): void;');
  });
});
