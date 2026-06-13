import { describe, expect, it } from 'vitest';
import { DataModel, type ModelKind } from '@/domain/data-model';
import type { ModelId } from '@/domain/ids';
import { buildFeatureLayout, modelPaths, relativeImport } from './layout';

describe('relativeImport', () => {
  it('同一ディレクトリは ./name', () => {
    expect(relativeImport('src/features/a/domain/x.ts', 'src/features/a/domain/y.ts')).toBe('./y');
  });
  it('上位ディレクトリへ遡る', () => {
    expect(relativeImport('src/features/a/domain/x.ts', 'src/shared/result.ts')).toBe(
      '../../../shared/result',
    );
  });
  it('拡張子(.ts/.tsx)を除去する', () => {
    expect(relativeImport('src/app/App.tsx', 'src/pages/Page0.tsx')).toBe('../pages/Page0');
  });
});

const unwrap = <T,>(r: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>): T => {
  if (!r.ok) throw new Error('fixture failed');
  return r.value;
};

const addModel = (dm: DataModel, kind: ModelKind, name: string): { dm: DataModel; id: ModelId } => {
  const added = DataModel.addModel(dm, kind, 0, 0);
  return { dm: unwrap(DataModel.updateModel(added.dataModel, added.model.id, { name })), id: added.model.id };
};

describe('buildFeatureLayout の機能割り当て', () => {
  it('集約は自身の feature、単一参照の VO/Entity はその feature、複数参照は shared', () => {
    let dm = DataModel.empty();
    const order = addModel(dm, 'aggregate', 'Order');
    dm = order.dm;
    const invoice = addModel(dm, 'aggregate', 'Invoice');
    dm = invoice.dm;
    const money = addModel(dm, 'valueObject', 'Money'); // 両集約から参照 → shared
    dm = money.dm;
    const lineItem = addModel(dm, 'entity', 'LineItem'); // Order のみ参照 → order feature
    dm = lineItem.dm;

    dm = unwrap(DataModel.addRelation(dm, order.id, money.id, 'hasOne')).dataModel;
    dm = unwrap(DataModel.addRelation(dm, invoice.id, money.id, 'hasOne')).dataModel;
    dm = unwrap(DataModel.addRelation(dm, order.id, lineItem.id, 'hasMany')).dataModel;

    const layout = buildFeatureLayout(dm);
    expect(layout.featureOf(order.id)).toBe('order');
    expect(layout.featureOf(invoice.id)).toBe('invoice');
    expect(layout.featureOf(lineItem.id)).toBe('order');
    expect(layout.featureOf(money.id)).toBeNull();
  });

  it('集約の domain は features 配下、shared の VO は shared/domain', () => {
    let dm = DataModel.empty();
    const order = addModel(dm, 'aggregate', 'Order');
    dm = order.dm;
    const orphan = addModel(dm, 'valueObject', 'Color'); // 参照されない → shared
    dm = orphan.dm;

    const layout = buildFeatureLayout(dm);
    const orderModel = DataModel.findModel(dm, order.id)!;
    const colorModel = DataModel.findModel(dm, orphan.id)!;
    expect(modelPaths(layout, orderModel).model).toBe('src/features/order/domain/order.ts');
    expect(modelPaths(layout, colorModel).model).toBe('src/shared/domain/color.ts');
  });
});
