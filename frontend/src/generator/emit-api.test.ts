import { describe, expect, it } from 'vitest';
import { DataModel, type ModelKind } from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import { emitApiFiles, supportsApi } from './emit-api';
import { generateProject } from './index';
import { ProjectDoc } from '@/domain/project-doc';

const unwrap = <T,>(r: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>): T => {
  if (!r.ok) throw new Error('fixture failed');
  return r.value;
};
const addModel = (dm: DataModel, kind: ModelKind, name: string): { dm: DataModel; id: ModelId } => {
  const a = DataModel.addModel(dm, kind, 0, 0);
  return { dm: unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name })), id: a.model.id };
};
const addField = (dm: DataModel, id: ModelId, patch: Parameters<typeof DataModel.updateField>[3]): DataModel => {
  const f = unwrap(DataModel.addField(dm, id));
  return unwrap(DataModel.updateField(f.dataModel, id, f.field.id, patch));
};

/** Customer(name) hasMany Order(entity), hasOne Email(単一VO) */
const supportedModel = () => {
  let dm = DataModel.empty();
  const c = addModel(dm, 'aggregate', 'Customer');
  dm = c.dm;
  const o = addModel(dm, 'entity', 'Order');
  dm = o.dm;
  const e = addModel(dm, 'valueObject', 'Email');
  dm = e.dm;
  dm = addField(dm, c.id, { name: 'name' });
  dm = addField(dm, e.id, { name: 'value' });
  dm = unwrap(DataModel.addRelation(dm, c.id, o.id, 'hasMany')).dataModel;
  dm = unwrap(DataModel.addRelation(dm, c.id, e.id, 'hasOne')).dataModel;
  return { dm, customerId: c.id };
};

describe('emitApiFiles', () => {
  const { dm } = supportedModel();
  const files = emitApiFiles(dm);
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? '';

  it('http クライアントと集約の API repository を生成する', () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/shared/api/http.ts');
    expect(paths).toContain('src/features/customer/infrastructure/api/customer-api-repository.ts');
  });

  it('API repository は DTO→ドメイン変換(ID参照 / 単一VO検証)を行う', () => {
    const src = get('src/features/customer/infrastructure/api/customer-api-repository.ts');
    expect(src).toContain('export const createCustomerApiRepository');
    // ID 参照(エンティティ hasMany)→ OrderId.from で配列変換
    expect(src).toContain('orders: dto.orders.map(OrderId.from),');
    // 単一 VO は create で検証してから埋め込む
    expect(src).toContain('const emailD = Email.create(dto.email);');
    expect(src).toContain('email: emailD.value,');
    expect(src).toContain('id: CustomerId.from(dto.id),');
  });

  it('container は VITE_APP_MODE=api で API、既定で mock に切り替える', () => {
    const doc = { ...ProjectDoc.create(), dataModel: dm };
    const container = generateProject(doc, 'x').find((f) => f.path === 'src/app/di/container.ts')!.content;
    expect(container).toContain(`const mode: string = import.meta.env.VITE_APP_MODE ?? 'mock';`);
    expect(container).toContain('const useApi = mode === ');
    expect(container).toContain(
      'customerRepository: useApi ? createCustomerApiRepository() : createInMemoryCustomerRepository(),',
    );
  });
});

describe('supportsApi(多フィールド VO 埋め込みは非対応)', () => {
  it('多フィールド VO を参照する集約は API 実装を生成しない', () => {
    let dm = DataModel.empty();
    const order = addModel(dm, 'aggregate', 'Order');
    dm = order.dm;
    const addr = addModel(dm, 'valueObject', 'Address');
    dm = addr.dm;
    dm = addField(dm, addr.id, { name: 'city' });
    dm = addField(dm, addr.id, { name: 'zip' });
    dm = unwrap(DataModel.addRelation(dm, order.id, addr.id, 'hasOne')).dataModel;

    const byId = new Map(dm.models.map((m) => [m.id, m] as const));
    const orderModel = DataModel.findModel(dm, order.id)!;
    expect(supportsApi(orderModel, dm, byId)).toBe(false);
    // API ファイルは生成されない(集約が1つで非対応 → 空)
    expect(emitApiFiles(dm)).toHaveLength(0);
  });
});
