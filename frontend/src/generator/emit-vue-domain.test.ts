import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { emitVueDomain } from './emit-vue-domain';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

/** Customer(集約: name:string, age:number) */
const customerModel = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name: 'Customer' }));
  const f1 = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f1.dataModel, a.model.id, f1.field.id, { name: 'name', type: 'string' }));
  const f2 = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f2.dataModel, a.model.id, f2.field.id, { name: 'age', type: 'number' }));
  return dm;
};

const find = (files: ReturnType<typeof emitVueDomain>['files'], path: string) =>
  files.find((f) => f.path === path)?.content ?? '';

describe('emitVueDomain(Vue ドメイン層生成 FR-GEN-07/B)', () => {
  const out = emitVueDomain(customerModel());

  it('集約ごとにドメインモジュール + 一覧ページ + ルートを出す', () => {
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain('src/domain/customer.ts');
    expect(paths).toContain('src/pages/admin/customer.vue');
    expect(out.routes).toContainEqual({ path: '/admin/customers', component: './pages/admin/customer.vue' });
  });

  it('ドメインモジュールは型 + create 検証 + シード付き mock repository', () => {
    const dom = find(out.files, 'src/domain/customer.ts');
    expect(dom).toContain('export type Customer = {');
    expect(dom).toContain('name: string;');
    expect(dom).toContain('age: number;');
    expect(dom).toContain('export function createCustomer(');
    expect(dom).toContain('export const CustomerRepository = {');
    // シードが3件
    expect((dom.match(/customer-\d/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('一覧ページは生成 repository をデータバインドし、相対 import が正しい', () => {
    const page = find(out.files, 'src/pages/admin/customer.vue');
    expect(page).toContain(`from '../../domain/customer'`);
    expect(page).toContain('CustomerRepository.list()');
    expect(page).toContain('v-for="row in rows"');
    expect(page).toContain('{{ row.name }}');
  });

  it('集約がなければ何も出さない', () => {
    const empty = emitVueDomain(DataModel.empty());
    expect(empty.files).toHaveLength(0);
    expect(empty.routes).toHaveLength(0);
  });
});
