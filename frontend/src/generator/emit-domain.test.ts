import { describe, expect, it } from 'vitest';
import { DataModel } from '@/domain/data-model';
import { ProjectDoc } from '@/domain/project-doc';
import { emitDomainFiles, emitContainerWithRepositories } from './emit-domain';
import { generateProject } from './index';

/** Customer(集約: name/age, orders: Order[], email: Email)+ Order(エンティティ)+ Email(単一VO) */
const buildModel = () => {
  let dm = DataModel.empty();
  const a = DataModel.addModel(dm, 'aggregate', 0, 0);
  dm = a.dataModel;
  const b = DataModel.addModel(dm, 'entity', 0, 0);
  dm = b.dataModel;
  const c = DataModel.addModel(dm, 'valueObject', 0, 0);
  dm = c.dataModel;

  const unwrap = <T,>(r: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>): T => {
    if (!r.ok) throw new Error('fixture failed');
    return r.value;
  };

  dm = unwrap(DataModel.updateModel(dm, a.model.id, { name: 'Customer' }));
  dm = unwrap(DataModel.updateModel(dm, b.model.id, { name: 'Order' }));
  dm = unwrap(DataModel.updateModel(dm, c.model.id, { name: 'Email' }));

  // Customer: name (string, 1..40), age (number, optional, 0..120)
  const f1 = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(
    DataModel.updateField(f1.dataModel, a.model.id, f1.field.id, { name: 'name', min: 1, max: 40 }),
  );
  const f2 = unwrap(DataModel.addField(dm, a.model.id));
  dm = unwrap(
    DataModel.updateField(f2.dataModel, a.model.id, f2.field.id, {
      name: 'age',
      type: 'number',
      required: false,
      min: 0,
      max: 120,
    }),
  );

  // Email: 単一フィールド VO(value: string, pattern)
  const f3 = unwrap(DataModel.addField(dm, c.model.id));
  dm = unwrap(
    DataModel.updateField(f3.dataModel, c.model.id, f3.field.id, {
      name: 'value',
      pattern: '^[^@]+@[^@]+$',
    }),
  );

  // Customer -> Order (1:N), Customer -> Email (1:1)
  dm = unwrap(DataModel.addRelation(dm, a.model.id, b.model.id, 'hasMany')).dataModel;
  dm = unwrap(DataModel.addRelation(dm, a.model.id, c.model.id, 'hasOne')).dataModel;
  return dm;
};

describe('emitDomainFiles', () => {
  const dm = buildModel();
  const files = emitDomainFiles(dm);
  const get = (path: string) => files.find((f) => f.path === path)?.content ?? '';

  it('features × レイヤード配置でモデル・repository・mock・共通ファイルが揃う', () => {
    const paths = files.map((f) => f.path);
    // 共通(shared)
    expect(paths).toContain('src/shared/validation.ts');
    expect(paths).toContain('src/shared/repository-error.ts');
    // Order / Email は Customer のみが参照 → customer feature に属する
    expect(paths).toContain('src/features/customer/domain/customer.ts');
    expect(paths).toContain('src/features/customer/domain/customer.test.ts');
    expect(paths).toContain('src/features/customer/domain/order.ts');
    expect(paths).toContain('src/features/customer/domain/email.ts');
    expect(paths).toContain('src/features/customer/domain/repositories/customer-repository.ts');
    expect(paths).toContain('src/features/customer/infrastructure/mock/in-memory-customer-repository.ts');
    // エンティティ / VO には repository を作らない
    expect(paths).not.toContain('src/features/customer/domain/repositories/order-repository.ts');
  });

  it('集約は brand ID + companion + Result 検証つき create/update を持つ', () => {
    const src = get('src/features/customer/domain/customer.ts');
    expect(src).toContain(`export type CustomerId = string & { readonly __brand: 'CustomerId' };`);
    expect(src).toContain('create(input: CustomerInput): Result<Customer, ReadonlyArray<ValidationError>>');
    expect(src).toContain('update(current: Customer, patch: Partial<CustomerInput>)');
    expect(src).toContain('input.name.length < 1');
    expect(src).toContain('input.age != null && (input.age > 120)');
    expect(src).not.toContain('class ');
    // shared への相対 import が正しく解決される(domain → shared は 4 階層上)
    expect(src).toContain(`from '../../../shared/result';`);
    expect(src).toContain(`from '../../../shared/validation';`);
  });

  it('リレーションは ID 参照 / VO 埋め込みで型付けされる', () => {
    const src = get('src/features/customer/domain/customer.ts');
    expect(src).toContain('orders: ReadonlyArray<OrderId>;');
    expect(src).toContain('email: Email | null;');
    expect(src).toContain(`import type { OrderId } from './order';`);
    expect(src).toContain(`import type { Email } from './email';`);
  });

  it('単一フィールド VO は branded primitive になる', () => {
    const src = get('src/features/customer/domain/email.ts');
    expect(src).toContain(`export type Email = string & { readonly __brand: 'Email' };`);
    expect(src).toContain('equals: (a: Email, b: Email): boolean => a === b');
  });

  it('pattern 制約付きモデルのテストは todo になる', () => {
    expect(get('src/features/customer/domain/email.test.ts')).toContain('it.todo');
    expect(get('src/features/customer/domain/customer.test.ts')).toContain('expect(result.ok).toBe(true)');
  });

  it('container は集約の repository を配線する(API 対応集約は api/mock 切替)', () => {
    const container = emitContainerWithRepositories(dm);
    expect(container).toContain('customerRepository: CustomerRepository;');
    expect(container).toContain(
      'customerRepository: useApi ? createCustomerApiRepository() : createInMemoryCustomerRepository(),',
    );
    expect(container).toContain(`from '../../features/customer/domain/repositories/customer-repository';`);
  });
});

describe('generateProject との統合', () => {
  it('dataModel があるとドメイン層ファイルが生成物に含まれる', () => {
    const doc = { ...ProjectDoc.create(), dataModel: buildModel() };
    const paths = generateProject(doc, 'x').map((f) => f.path);
    expect(paths).toContain('src/features/customer/domain/customer.ts');
    expect(paths.filter((p) => p === 'src/app/di/container.ts')).toHaveLength(1);
  });

  it('dataModel が空ならドメイン層は生成されない', () => {
    const paths = generateProject(ProjectDoc.create(), 'x').map((f) => f.path);
    expect(paths.some((p) => p.startsWith('src/features/'))).toBe(false);
  });
});
