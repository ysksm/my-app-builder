import type { ReactNode } from 'react';
import type { DataSourceDef, QueryDef } from '@/domain/data-source';
import type { DataSourceId, QueryId } from '@/domain/ids';
import {
  dataSourceAdded,
  dataSourceRemoved,
  dataSourceUpdated,
  queryAdded,
  queryRemoved,
  queryUpdated,
} from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

/**
 * ライブデータ層(FR-DATA-01)。REST データソースと、それに対する名前付きクエリを管理する。
 * テーブル等は queryRef でクエリを参照し、生成アプリで `queries.<name>` としてライブ取得する。
 */
export function DataView() {
  const dispatch = useAppDispatch();
  const dataSources = useAppSelector((s) => s.editor.doc.dataSources);
  const queries = useAppSelector((s) => s.editor.doc.queries);

  return (
    <div className="channels-root">
      <div className="channels-head">
        <div>
          <h2 className="channels-h2">データソース</h2>
          <p className="muted channels-note">
            REST データの出所を登録します。クエリから参照され、生成アプリでライブ取得されます(FR-DATA-01)。
          </p>
        </div>
        <button type="button" className="channel-add" onClick={() => dispatch(dataSourceAdded(undefined))}>
          + データソースを追加
        </button>
      </div>

      {dataSources.length === 0 ? (
        <p className="muted channels-empty">データソースがありません。「+ データソースを追加」で作成します。</p>
      ) : (
        <ul className="channel-list">
          {dataSources.map((ds) => (
            <DataSourceCard key={ds.id} dataSource={ds} />
          ))}
        </ul>
      )}

      <div className="channels-head" style={{ marginTop: 24 }}>
        <div>
          <h2 className="channels-h2">クエリ</h2>
          <p className="muted channels-note">
            データソースに対する操作。`queries.&lt;名前&gt;` で参照され、テーブルの「データ(クエリ)」から選べます。
          </p>
        </div>
        <button type="button" className="channel-add" onClick={() => dispatch(queryAdded(undefined))}>
          + クエリを追加
        </button>
      </div>

      {queries.length === 0 ? (
        <p className="muted channels-empty">クエリがありません。「+ クエリを追加」で作成します。</p>
      ) : (
        <ul className="channel-list">
          {queries.map((q) => (
            <QueryCard key={q.id} query={q} dataSources={dataSources} queries={queries} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DataSourceCard({ dataSource }: { dataSource: DataSourceDef }) {
  const dispatch = useAppDispatch();
  const id = dataSource.id as DataSourceId;
  const patch = (p: Partial<Omit<DataSourceDef, 'id'>>) => dispatch(dataSourceUpdated({ dataSourceId: id, patch: p }));

  return (
    <li className="channel-card">
      <div className="channel-card-head">
        <input
          className="channel-name"
          value={dataSource.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="データソース名"
        />
        <button type="button" className="channel-remove" onClick={() => dispatch(dataSourceRemoved(id))}>
          削除
        </button>
      </div>
      <div className="channel-grid">
        <Field label="ベース URL">
          <input
            value={dataSource.baseUrl}
            onChange={(e) => patch({ baseUrl: e.target.value })}
            placeholder="https://api.example.com"
          />
        </Field>
      </div>
    </li>
  );
}

function QueryCard({
  query,
  dataSources,
  queries,
}: {
  query: QueryDef;
  dataSources: ReadonlyArray<DataSourceDef>;
  queries: ReadonlyArray<QueryDef>;
}) {
  const dispatch = useAppDispatch();
  const id = query.id as QueryId;
  const patch = (p: Partial<Omit<QueryDef, 'id'>>) => dispatch(queryUpdated({ queryId: id, patch: p }));
  // 成功後に再取得できる候補は自分以外のクエリ(一覧更新など)
  const others = queries.filter((q) => q.id !== query.id);

  return (
    <li className="channel-card">
      <div className="channel-card-head">
        <input
          className="channel-name"
          value={query.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="クエリ名(識別子)"
        />
        <button type="button" className="channel-remove" onClick={() => dispatch(queryRemoved(id))}>
          削除
        </button>
      </div>
      <div className="channel-grid">
        <Field label="データソース">
          <select value={query.dataSourceId} onChange={(e) => patch({ dataSourceId: e.target.value as DataSourceId | '' })}>
            <option value="">(未割当)</option>
            {dataSources.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="メソッド">
          <select value={query.method} onChange={(e) => patch({ method: e.target.value as QueryDef['method'] })}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </Field>
        <Field label="パス">
          <input value={query.path} onChange={(e) => patch({ path: e.target.value })} placeholder="/users" />
        </Field>
        {query.method !== 'GET' && (
          <>
            <Field label="リクエストボディ(JSON, {{ }} 式可)">
              <textarea
                value={query.body ?? ''}
                onChange={(e) => patch({ body: e.target.value || undefined })}
                placeholder={'{ "name": "{{input1.value}}" }'}
                rows={3}
              />
            </Field>
            <Field label="成功後に再取得">
              <select value={query.refetch ?? ''} onChange={(e) => patch({ refetch: e.target.value || undefined })}>
                <option value="">(なし)</option>
                {others.map((q) => (
                  <option key={q.id} value={q.name}>
                    {q.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="channel-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
