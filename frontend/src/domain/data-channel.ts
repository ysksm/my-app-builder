import { ChannelId } from './ids';

/**
 * データチャネル定義(FR-RT-01)。モニタリング部品が channelRef で参照する単一ソース。
 * コネクタ設定(mock / live / Modbus レジスタマップ)をここに集約し、部品側は
 * 表示プロパティ(ラベル・単位・しきい値)だけを持つ。生成時に解決される。
 */
export type DataChannelDef = Readonly<{
  id: ChannelId;
  name: string;
  /** BE の WS チャネルキー(/api/channels/{key}/stream) */
  key: string;
  source: 'mock' | 'live' | 'modbus';
  min: number;
  max: number;
  interval: number;
  // Modbus/TCP(source=modbus のとき)
  host?: string;
  unit?: number;
  register?: number;
  scale?: number;
}>;

export const DataChannelDef = {
  create(name: string, patch: Partial<Omit<DataChannelDef, 'id'>> = {}): DataChannelDef {
    return {
      id: ChannelId.create(),
      name: name.trim() || 'チャネル',
      key: patch.key ?? 'ch',
      source: patch.source ?? 'mock',
      min: patch.min ?? 0,
      max: patch.max ?? 100,
      interval: patch.interval ?? 1000,
      host: patch.host,
      unit: patch.unit,
      register: patch.register,
      scale: patch.scale,
    };
  },
} as const;
