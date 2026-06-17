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
  /** 書き込み(非GET)のリクエストボディ。JSON テンプレート({{ }} 式可)。空 = ボディなし */
  body?: string;
  /** 成功後に再取得するクエリ名(一覧の自動更新など)。空 = なし */
  refetch?: string;
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
    const base: QueryDef = {
      id: QueryId.create(),
      name: slug(patch.name ?? name),
      dataSourceId: patch.dataSourceId ?? '',
      method: patch.method ?? 'GET',
      path: patch.path ?? '/',
    };
    // 書き込みクエリの任意フィールドは指定があるときだけ載せる(後方互換: 既定は未設定)
    return {
      ...base,
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.refetch !== undefined ? { refetch: patch.refetch } : {}),
    };
  },
  /** name を一意な識別子に整える(コード参照用) */
  slug,
} as const;
