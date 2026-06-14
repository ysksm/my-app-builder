import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { emitSvelteDomain } from './emit-svelte-domain';
import { emitRemixDomain } from './emit-remix-domain';

const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error('fixture');
  return r.value;
};

const customerModel = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = unwrap(DataModel.updateModel(a.dataModel, a.model.id, { name: 'Customer' }));
  const f = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(DataModel.updateField(f.dataModel, a.model.id, f.field.id, { name: 'name', type: 'string' }));
  return dm;
};

const find = (files: { path: string; content: string }[], path: string) =>
  files.find((x) => x.path === path)?.content ?? '';

describe('emitSvelteDomain(Svelte ドメイン層 FR-GEN-07/B)', () => {
  const out = emitSvelteDomain(customerModel());
  it('ドメインモジュール + 一覧 .svelte + svelte-spa-router ルート', () => {
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain('src/domain/customer.ts');
    expect(paths).toContain('src/pages/admin/customer.svelte');
    expect(out.routes).toContainEqual({ path: '/admin/customers', importName: 'AdminCustomer', importPath: './pages/admin/customer.svelte' });
    const page = find(out.files, 'src/pages/admin/customer.svelte');
    expect(page).toContain(`from '../../domain/customer'`);
    expect(page).toContain('$state<Customer[]>');
    expect(page).toContain('{#each rows as row (row.id)}');
  });
});

describe('emitRemixDomain(Remix ドメイン層 FR-GEN-07/B)', () => {
  const out = emitRemixDomain(customerModel());
  it('ドメインモジュール + 一覧ルート .tsx + routes.ts エントリ', () => {
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain('app/domain/customer.ts');
    expect(paths).toContain('app/routes/admin-customer.tsx');
    expect(out.routeEntries).toContain(`  route('admin/customers', 'routes/admin-customer.tsx'),`);
    const page = find(out.files, 'app/routes/admin-customer.tsx');
    expect(page).toContain(`from '../domain/customer'`);
    expect(page).toContain('export default function AdminCustomer()');
    expect(page).toContain('rows.map((row) =>');
  });

  it('集約がなければ何も出さない(両フレームワーク)', () => {
    expect(emitSvelteDomain(DataModel.empty()).files).toHaveLength(0);
    expect(emitRemixDomain(DataModel.empty()).files).toHaveLength(0);
  });
});
