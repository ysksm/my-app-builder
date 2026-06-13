import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { emitUsecaseFiles } from './emit-usecase';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

/** Order(集約: total:number)+ self 返却・無引数サービス applyDiscount */
const build = (opts: { withService: boolean; save: boolean }) => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name: 'Order' }));
  const f = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f.dataModel, a.model.id, f.field.id, { name: 'total', type: 'number' }));

  let serviceId: string | null = null;
  if (opts.withService) {
    const s = unwrap(DataModel.addService(dm, a.model.id));
    dm = unwrap(DataModel.updateService(s.dataModel, a.model.id, s.service.id, { name: 'applyDiscount', returns: 'self', params: [] }));
    serviceId = s.service.id;
  }
  const u = unwrap(DataModel.addUsecase(dm, a.model.id));
  dm = unwrap(
    DataModel.updateUsecase(u.dataModel, a.model.id, u.usecase.id, {
      name: 'placeOrder',
      serviceIds: serviceId ? [serviceId as never] : [],
      save: opts.save,
    }),
  );
  return dm;
};

describe('ユースケース生成', () => {
  it('create → save の読める application 関数を生成する(repository 引数注入)', () => {
    const files = emitUsecaseFiles(build({ withService: false, save: true }));
    const uc = files.find((f) => f.path === 'src/features/order/application/place-order.ts')!.content;
    expect(uc).toContain('export const placeOrder = async (');
    expect(uc).toContain('repository: OrderRepository,');
    expect(uc).toContain('input: OrderInput,');
    expect(uc).toContain('const created = Order.create(input);');
    expect(uc).toContain('if (!created.ok) return created;');
    expect(uc).toContain('return repository.save(entity);');
  });

  it('サービスを挟むと create → service → save になる(impl を import)', () => {
    const files = emitUsecaseFiles(build({ withService: true, save: true }));
    const uc = files.find((f) => f.path === 'src/features/order/application/place-order.ts')!.content;
    expect(uc).toContain('let entity = created.value;');
    expect(uc).toContain('entity = applyDiscount(entity);');
    expect(uc).toContain('return repository.save(entity);');
    expect(uc).toContain(`import { applyDiscount } from '../domain/services/apply-discount.impl';`);
  });

  it('save=false なら ok(entity) を返す', () => {
    const files = emitUsecaseFiles(build({ withService: false, save: false }));
    const uc = files.find((f) => f.path === 'src/features/order/application/place-order.ts')!.content;
    expect(uc).toContain('return ok(entity);');
    expect(uc).not.toContain('repository.save');
  });

  it('サービスなしの場合は実行テストを、ありの場合は todo テストを生成する', () => {
    const noSvc = emitUsecaseFiles(build({ withService: false, save: true }));
    const t1 = noSvc.find((f) => f.path === 'src/features/order/application/place-order.test.ts')!.content;
    expect(t1).toContain('createInMemoryOrderRepository');
    expect(t1).toContain('expect(result.ok).toBe(true)');

    const withSvc = emitUsecaseFiles(build({ withService: true, save: true }));
    const t2 = withSvc.find((f) => f.path === 'src/features/order/application/place-order.test.ts')!.content;
    expect(t2).toContain('it.todo');
  });
});
