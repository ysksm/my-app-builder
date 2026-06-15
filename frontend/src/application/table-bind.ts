import type { DataModel, FieldType } from '@/domain/data-model';

/**
 * テーブルのデータバインド(FR-MDL / データバインド強化)。
 * テーブルを集約に紐付けると、列 = 集約のフィールド、行 = フィールド型から生成したサンプルになる。
 * 設計時(ビルダー・生成時)にデータモデルから解決する(ランタイム DI 不要の design-time バインド)。
 */
const sampleValue = (type: FieldType, r: number): string => {
  switch (type) {
    case 'number':
      return String((r + 1) * 10);
    case 'boolean':
      return r % 2 === 0 ? 'true' : 'false';
    case 'date':
      return `2026-0${(r % 9) + 1}-01`;
    default:
      return `値${r + 1}`;
  }
};

/** 集約 ID → 列 + サンプル行。集約が見つからなければ null */
export const tableDataFromModel = (
  dm: DataModel,
  aggregateId: string,
  rows: number,
): { columns: string[]; rows: string[][] } | null => {
  const model = dm.models.find((m) => m.id === aggregateId && m.kind === 'aggregate');
  if (!model) return null;
  const columns = ['id', ...model.fields.map((f) => f.name)];
  const n = Math.max(0, Math.min(20, rows));
  const out: string[][] = [];
  for (let r = 0; r < n; r += 1) {
    out.push([String(r + 1), ...model.fields.map((f) => sampleValue(f.type, r))]);
  }
  return { columns, rows: out };
};
