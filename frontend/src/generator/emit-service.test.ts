import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { emitDomainFiles } from './emit-domain';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

const buildModel = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name: 'Cart' }));
  const f = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f.dataModel, a.model.id, f.field.id, { name: 'subtotal', type: 'number' }));
  const s = unwrap(DataModel.addService(dm, a.model.id));
  dm = unwrap(
    DataModel.updateService(s.dataModel, a.model.id, s.service.id, {
      name: 'calculateTotal',
      params: [{ name: 'taxRate', type: 'number' }],
      returns: 'number',
    }),
  );
  return dm;
};

describe('ドメインサービス契約の生成', () => {
  const files = emitDomainFiles(buildModel());
  const get = (p: string) => files.find((f) => f.path === p);

  it('契約(overwrite=true)と実装スタブ(overwrite=false)を生成する', () => {
    const contract = get('src/features/cart/domain/services/calculate-total.ts');
    const impl = get('src/features/cart/domain/services/calculate-total.impl.ts');
    expect(contract).toBeDefined();
    expect(impl).toBeDefined();
    // 契約は毎回上書き、実装はユーザー所有(保持)
    expect(contract!.overwrite).toBeUndefined();
    expect(impl!.overwrite).toBe(false);
  });

  it('契約は型のみ(entity + params → 戻り値)', () => {
    const contract = get('src/features/cart/domain/services/calculate-total.ts')!.content;
    expect(contract).toContain('export type CalculateTotalService = (entity: Cart, taxRate: number) => number;');
    expect(contract).toContain(`import type { Cart } from '../cart';`);
  });

  it('実装スタブは契約型を実装し未実装で throw する', () => {
    const impl = get('src/features/cart/domain/services/calculate-total.impl.ts')!.content;
    expect(impl).toContain('export const calculateTotal: CalculateTotalService = (entity, taxRate) => {');
    expect(impl).toContain(`throw new Error('calculateTotal は未実装です');`);
    expect(impl).toContain(`import type { CalculateTotalService } from './calculate-total';`);
    // 再生成で上書きされない旨のコメント
    expect(impl).toContain('再生成で上書きされません');
  });

  it('self 戻り値は集約型になる', () => {
    let dm = DataModel.empty();
    const a = DataModel.addModel(dm, 'aggregate', 0, 0);
    dm = unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name: 'Cart' }));
    const s = unwrap(DataModel.addService(dm, a.model.id));
    dm = unwrap(DataModel.updateService(s.dataModel, a.model.id, s.service.id, { name: 'archive', returns: 'self' }));
    const contract = emitDomainFiles(dm).find((f) => f.path === 'src/features/cart/domain/services/archive.ts')!.content;
    expect(contract).toContain('export type ArchiveService = (entity: Cart) => Cart;');
  });
});
