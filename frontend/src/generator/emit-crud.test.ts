import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { ProjectDoc } from '@/domain/project-doc';
import { emitCrudFiles, crudRoutes } from './emit-crud';
import { generateProject } from './index';

const buildModel = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = a.dataModel;
  const renamed = DataModel.updateModel(dm, a.model.id, { name: 'Customer' });
  if (!renamed.ok) throw new Error();
  dm = renamed.value;
  const f = DataModel.addField(dm, a.model.id);
  if (!f.ok) throw new Error();
  const upd = DataModel.updateField(f.value.dataModel, a.model.id, f.value.field.id, {
    name: 'name',
  });
  if (!upd.ok) throw new Error();
  return upd.value;
};

describe('emitCrudFiles', () => {
  const dm = buildModel();
  const files = emitCrudFiles(dm);
  const get = (path: string) => files.find((f) => f.path === path)?.content ?? '';

  it('feature 配下にユースケース・コンテキスト・管理画面、pages にインデックスを生成する', () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/features/customer/application/customer-usecases.ts');
    expect(paths).toContain('src/features/customer/presentation/customer-context.ts');
    expect(paths).toContain('src/features/customer/presentation/CustomerAdminPage.tsx');
    expect(paths).toContain('src/pages/admin/AdminIndexPage.tsx');
  });

  it('ユースケースは repository 引数注入(DIP)で生成される', () => {
    const src = get('src/features/customer/application/customer-usecases.ts');
    expect(src).toContain('repository: CustomerRepository');
    expect(src).toContain('const created = Customer.create(input);');
    expect(src).toContain('return repository.save(created.value);');
    // feature → shared の相対 import(application は 3 階層上)
    expect(src).toContain(`from '../../../shared/result';`);
  });

  it('管理画面は app/di を直接参照せず feature コンテキスト経由で repository を得る', () => {
    const src = get('src/features/customer/presentation/CustomerAdminPage.tsx');
    expect(src).not.toContain('di/container');
    expect(src).toContain('const repository = useCustomerRepository();');
    expect(src).toContain(`from './customer-context';`);
    expect(src).toContain('createCustomer(repository, {');
    expect(src).toContain('listCustomers(repository)');
    expect(src).toContain(`const [nameInput, setNameInput] = useState('')`);
  });

  it('コンテキストは repository I/F 型の React コンテキストとフックを提供する', () => {
    const src = get('src/features/customer/presentation/customer-context.ts');
    expect(src).toContain('createContext<CustomerRepository | null>(null)');
    expect(src).toContain('export const useCustomerRepository');
  });

  it('crudRoutes が /admin と集約ルートを返す', () => {
    expect(crudRoutes(dm).map((r) => r.path)).toEqual(['/admin', '/admin/customer']);
    expect(crudRoutes(DataModel.empty())).toEqual([]);
  });

  it('App.tsx に CRUD ルートと DI プロバイダが組み込まれる', () => {
    const doc = { ...ProjectDoc.create(), dataModel: dm };
    const app = generateProject(doc, 'x').find((f) => f.path === 'src/app/App.tsx')!.content;
    expect(app).toContain('<Route path="/admin"');
    expect(app).toContain('<Route path="/admin/customer"');
    expect(app).toContain(`import { CustomerAdminPage } from '../features/customer/presentation/CustomerAdminPage';`);
    expect(app).toContain('<CustomerRepositoryContext.Provider value={container.customerRepository}>');
  });
});
