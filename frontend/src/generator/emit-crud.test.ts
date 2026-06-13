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

  it('ユースケース・管理画面・インデックスを生成する', () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/application/usecases/customer-usecases.ts');
    expect(paths).toContain('src/pages/admin/CustomerAdminPage.tsx');
    expect(paths).toContain('src/pages/admin/AdminIndexPage.tsx');
  });

  it('ユースケースは repository 引数注入(DIP)で生成される', () => {
    const src = get('src/application/usecases/customer-usecases.ts');
    expect(src).toContain('repository: CustomerRepository');
    expect(src).toContain('const created = Customer.create(input);');
    expect(src).toContain('return repository.save(created.value);');
  });

  it('管理画面は container 経由でユースケースを呼ぶ', () => {
    const src = get('src/pages/admin/CustomerAdminPage.tsx');
    expect(src).toContain('container.customerRepository');
    expect(src).toContain('createCustomer(repository, {');
    expect(src).toContain('listCustomers(repository)');
    expect(src).toContain(`const [nameInput, setNameInput] = useState('')`);
  });

  it('crudRoutes が /admin と集約ルートを返す', () => {
    expect(crudRoutes(dm).map((r) => r.path)).toEqual(['/admin', '/admin/customer']);
    expect(crudRoutes(DataModel.empty())).toEqual([]);
  });

  it('App.tsx に CRUD ルートが組み込まれる', () => {
    const doc = { ...ProjectDoc.create(), dataModel: dm };
    const app = generateProject(doc, 'x').find((f) => f.path === 'src/App.tsx')!.content;
    expect(app).toContain('<Route path="/admin"');
    expect(app).toContain('<Route path="/admin/customer"');
    expect(app).toContain(`import { CustomerAdminPage } from './pages/admin/CustomerAdminPage';`);
  });
});
