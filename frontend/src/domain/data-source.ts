import { DataSourceId, QueryId } from './ids';

/**
 * ライブデータ層(FR-DATA-01)。ToolJet 風のデータソース＋クエリ。
 * データソース = 外部データの出所(v1 は REST: baseUrl)。
 * クエリ = データソースに対する名前付き操作。生成アプリでは `queries.<name>` で解決され、
 * テーブル等が queryRef で参照してライブ取得する(設計時はサンプル/プレースホルダ)。
 */
export type DataSourceDef = Readonly<{
  id: DataSourceId;
  name: string;
  /** REST のベース URL(例: https://api.example.com)。空可。 */
  baseUrl: string;
}>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type QueryDef = Readonly<{
  id: QueryId;
  /** コード参照に使う識別子(queries.<name>)。一意・英数 */
  name: string;
  /** 紐づくデータソース。空 = 未割当 */
  dataSourceId: DataSourceId | '';
  method: HttpMethod;
  /** baseUrl からの相対パス(例: /users) */
  path: string;
}>;

const slug = (s: string): string =>
  s
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'query';

export const DataSourceDef = {
  create(name: string, baseUrl = ''): DataSourceDef {
    return { id: DataSourceId.create(), name: name.trim() || 'データソース', baseUrl: baseUrl.trim() };
  },
} as const;

export const QueryDef = {
  create(name: string, patch: Partial<Omit<QueryDef, 'id'>> = {}): QueryDef {
    return {
      id: QueryId.create(),
      name: slug(patch.name ?? name),
      dataSourceId: patch.dataSourceId ?? '',
      method: patch.method ?? 'GET',
      path: patch.path ?? '/',
    };
  },
  /** name を一意な識別子に整える(コード参照用) */
  slug,
} as const;
