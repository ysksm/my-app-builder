/**
 * 外部ライブラリ製コンポーネントの純粋ヘルパ(ビルダープレビュー用)。
 * 生成コード側(runtime / SFC)にも同じロジックを文字列テンプレートで持つので、
 * 振る舞いを一致させること。
 */

export type EChartType = 'gauge' | 'line' | 'bar';

export type EChartParams = Readonly<{
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  series: ReadonlyArray<number>;
  decimals: number;
  color: string;
}>;

/** chartType と現在値/系列から ECharts のオプションを組み立てる(gauge / line / bar) */
export const echartsOption = (type: EChartType, p: EChartParams): Record<string, unknown> => {
  if (type === 'gauge') {
    return {
      series: [
        {
          type: 'gauge',
          min: p.min,
          max: p.max,
          progress: { show: true, width: 10 },
          axisLine: { lineStyle: { width: 10 } },
          itemStyle: { color: p.color },
          pointer: { width: 4 },
          detail: {
            valueAnimation: true,
            formatter: `{value}${p.unit}`,
            fontSize: 18,
            offsetCenter: [0, '70%'],
          },
          title: { show: false },
          data: [{ value: Number(p.value.toFixed(p.decimals)) }],
        },
      ],
    };
  }
  const seriesData = p.series.map((v) => Number(v.toFixed(p.decimals)));
  return {
    grid: { left: 36, right: 10, top: 16, bottom: 18 },
    xAxis: { type: 'category', show: false, data: seriesData.map((_, i) => i) },
    yAxis: { type: 'value', min: p.min, max: p.max, scale: false },
    series: [
      type === 'bar'
        ? { type: 'bar', data: seriesData, itemStyle: { color: p.color } }
        : {
            type: 'line',
            data: seriesData,
            smooth: true,
            showSymbol: false,
            lineStyle: { color: p.color, width: 2 },
            areaStyle: { opacity: 0.15, color: p.color },
          },
    ],
  };
};

/** AG Grid 用のサンプル行データを生成(列名から型を推測した擬似データ) */
export const sampleGridRows = (
  columns: ReadonlyArray<string>,
  rows: number,
): Array<Record<string, string | number>> => {
  const result: Array<Record<string, string | number>> = [];
  for (let r = 0; r < rows; r += 1) {
    const row: Record<string, string | number> = {};
    columns.forEach((col, ci) => {
      const lower = col.toLowerCase();
      if (ci === 0 || lower === 'id') row[col] = r + 1;
      else if (/数量|qty|count|個数|量|price|金額|amount/.test(lower) || /数量|金額|量/.test(col))
        row[col] = (r + 1) * 10;
      else if (/状態|status|state/.test(lower) || /状態/.test(col))
        row[col] = ['active', 'idle', 'error'][r % 3]!;
      else row[col] = `${col}${r + 1}`;
    });
    result.push(row);
  }
  return result;
};
