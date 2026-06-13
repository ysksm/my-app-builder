import type { DataChannelDef } from '@/domain/data-channel';
import type { ChannelId } from '@/domain/ids';
import { channelAdded, channelRemoved, channelUpdated } from '../store/editor-slice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

/**
 * データチャネル設定(FR-RT-01)。モニタリング部品が channelRef で参照する単一ソースを
 * ここで集中管理する。各部品はチャネルを参照するだけで、コネクタ設定(mock / live /
 * Modbus レジスタマップ)はこの登録簿に一元化される。生成時に channelRef が解決される。
 */
export function ChannelsView() {
  const dispatch = useAppDispatch();
  const channels = useAppSelector((s) => s.editor.doc.channels);

  return (
    <div className="channels-root">
      <div className="channels-head">
        <div>
          <h2 className="channels-h2">データチャネル</h2>
          <p className="muted channels-note">
            コネクタ設定をチャネルとして登録し、モニタリング部品から参照します(FR-RT-01)。
            Modbus レジスタマップもここで定義します。
          </p>
        </div>
        <button type="button" className="channel-add" onClick={() => dispatch(channelAdded(undefined))}>
          + チャネルを追加
        </button>
      </div>

      {channels.length === 0 ? (
        <p className="muted channels-empty">
          チャネルがありません。「+ チャネルを追加」で作成し、部品の「データチャネル」から参照できます。
        </p>
      ) : (
        <ul className="channel-list">
          {channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChannelCard({ channel }: { channel: DataChannelDef }) {
  const dispatch = useAppDispatch();
  const id = channel.id as ChannelId;
  const patch = (p: Partial<Omit<DataChannelDef, 'id'>>) => dispatch(channelUpdated({ channelId: id, patch: p }));

  return (
    <li className="channel-card">
      <div className="channel-card-head">
        <input
          className="channel-name"
          value={channel.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="チャネル名"
        />
        <button type="button" className="channel-remove" onClick={() => dispatch(channelRemoved(id))}>
          削除
        </button>
      </div>
      <div className="channel-grid">
        <Field label="チャネルキー(WS)">
          <input value={channel.key} onChange={(e) => patch({ key: e.target.value })} />
        </Field>
        <Field label="データ源">
          <select
            value={channel.source}
            onChange={(e) => patch({ source: e.target.value as DataChannelDef['source'] })}
          >
            <option value="mock">模擬データ</option>
            <option value="live">ライブ(WS)</option>
            <option value="modbus">Modbus/TCP</option>
          </select>
        </Field>
        <Field label="最小値">
          <input type="number" value={channel.min} onChange={(e) => patch({ min: Number(e.target.value) })} />
        </Field>
        <Field label="最大値">
          <input type="number" value={channel.max} onChange={(e) => patch({ max: Number(e.target.value) })} />
        </Field>
        <Field label="更新間隔(ms)">
          <input type="number" value={channel.interval} onChange={(e) => patch({ interval: Number(e.target.value) })} />
        </Field>
        {channel.source === 'modbus' && (
          <>
            <Field label="Modbus host:port">
              <input value={channel.host ?? ''} onChange={(e) => patch({ host: e.target.value })} placeholder="127.0.0.1:5502" />
            </Field>
            <Field label="ユニット ID">
              <input type="number" value={channel.unit ?? 1} onChange={(e) => patch({ unit: Number(e.target.value) })} />
            </Field>
            <Field label="保持レジスタ番号">
              <input type="number" value={channel.register ?? 0} onChange={(e) => patch({ register: Number(e.target.value) })} />
            </Field>
            <Field label="スケール係数">
              <input type="number" value={channel.scale ?? 1} onChange={(e) => patch({ scale: Number(e.target.value) })} />
            </Field>
          </>
        )}
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="channel-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
