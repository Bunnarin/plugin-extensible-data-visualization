import React, { useMemo, useRef } from 'react';
import { SheetComponent } from '@antv/s2-react';
import '@antv/s2-react/dist/style.min.css';
import { copyData } from '@antv/s2';
import type { S2DataConfig, S2Options, SpreadSheet } from '@antv/s2';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';

export type PivotTableProps = {
  data: Record<string, any>[];
  rows?: string[];
  columns?: string[];
  values?: string[];
  aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max';
  fieldLabels?: Record<string, string>;
  style?: React.CSSProperties;
  [key: string]: any;
};

export const PivotTable: React.FC<PivotTableProps> = ({
  data = [],
  rows = [],
  columns = [],
  values = [],
  aggregation = 'sum',
  fieldLabels = {},
  style,
  ...rest
}) => {
  const s2Ref = useRef<SpreadSheet>();

  const handleDownload = () => {
    if (!s2Ref.current) return;
    try {
      // copyData returns the formatted text. We use ',' for CSV compatibility with Excel.
      const csvString = copyData(s2Ref.current, ',', false);
      const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' }); // \ufeff for Excel UTF-8 BOM
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'pivot-table.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export CSV', err);
    }
  };

  // Pre-aggregate the data so S2 receives exactly one record per cell
  const aggregatedData = useMemo(() => {
    if (!data.length || (!rows.length && !columns.length)) return data;

    const grouped = new Map<string, any>();

    data.forEach(row => {
      // Build a unique key for the row+col intersection
      const keyParts = [...rows, ...columns].map(f => row[f] ?? '');
      const key = keyParts.join('\x00');

      if (!grouped.has(key)) {
        const initialItem = { ...row, _count: 1 };
        values.forEach(v => {
          const val = Number(row[v]);
          const alias = `__val_${v}`;
          initialItem[alias] = isNaN(val) ? 0 : val;
          if (aggregation === 'count') {
            initialItem[alias] = 1;
          }
        });
        grouped.set(key, initialItem);
      } else {
        const item = grouped.get(key);
        item._count += 1;
        values.forEach(v => {
          const val = Number(row[v]);
          const numVal = isNaN(val) ? 0 : val;
          const alias = `__val_${v}`;

          if (aggregation === 'sum') item[alias] += numVal;
          if (aggregation === 'count') item[alias] += 1;
          if (aggregation === 'min') item[alias] = Math.min(item[alias], numVal);
          if (aggregation === 'max') item[alias] = Math.max(item[alias], numVal);
          if (aggregation === 'avg') item[alias] += numVal; // We'll divide by count later
        });
      }
    });

    const result = Array.from(grouped.values());
    if (aggregation === 'avg') {
      result.forEach(item => {
        values.forEach(v => {
          const alias = `__val_${v}`;
          if (item._count > 0) item[alias] = item[alias] / item._count;
        });
      });
    }

    return result;
  }, [data, rows, columns, values, aggregation]);

  const s2Values = useMemo(() => values.map(v => `__val_${v}`), [values]);

  const dataCfg: S2DataConfig = useMemo(() => {
    const finalFieldLabels = { ...fieldLabels };
    values.forEach(v => {
      finalFieldLabels[`__val_${v}`] = fieldLabels[v] || v;
    });

    return {
      fields: {
        rows,
        columns,
        values: s2Values,
      },
      meta: Object.entries(finalFieldLabels).map(([field, name]) => ({ field, name })),
      data: aggregatedData,
    };
  }, [aggregatedData, rows, columns, values, s2Values, fieldLabels]);

  const options: S2Options = useMemo(
    () => ({
      width: undefined,
      height: 480,
      interaction: {
        selectedCellsSpotlight: true,
        hoverHighlight: true,
      },
      ...rest,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rest],
  );

  if (!rows.length && !values.length) {
    return <div style={{ padding: 16, color: '#888' }}>Configure rows and values to display the pivot table.</div>;
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
          Export CSV
        </Button>
      </div>
      <div style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
        <SheetComponent ref={s2Ref as any} dataCfg={dataCfg} options={options as any} sheetType="pivot" adaptive={{ width: true, height: false }} />
      </div>
    </div>
  );
};
