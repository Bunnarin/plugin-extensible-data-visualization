import React, { useMemo, useRef } from 'react';
import { SheetComponent } from '@antv/s2-react';
import '@antv/s2-react/dist/style.min.css';
import { copyData } from '@antv/s2';
import type { S2DataConfig, S2Options, SpreadSheet } from '@antv/s2';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

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
      // Get raw TSV data from S2
      const tsvString = copyData(s2Ref.current, '\t', false);
      const headerRowCount = columns.length + (values.length > 1 || !columns.length ? 1 : 0);
      const rowHeaderColCount = rows.length;

      const grid = tsvString.split(/\r?\n/).map((line, rIndex) => line.split('\t').map((c, cIndex) => {
        let v: string | number = c.replace(/^"|"$/g, '');
        const isDataCell = rIndex >= headerRowCount && cIndex >= rowHeaderColCount;
        
        if (isDataCell && (v === 'null' || v === '-')) v = 0;
        else if (v !== '' && !isNaN(Number(v))) v = Number(v);
        
        return v;
      }));

      // Build merges for Excel
      const merges: XLSX.Range[] = [];

      // Vertical merges in row headers
      for (let c = 0; c < rowHeaderColCount; c++) {
        let startR = headerRowCount;
        for (let r = headerRowCount + 1; r < grid.length; r++) {
          const val = grid[r][c];
          const prevVal = grid[startR][c];
          if (val !== prevVal && val !== '') {
            if (r - 1 > startR) {
              merges.push({ s: { r: startR, c }, e: { r: r - 1, c } });
              // Clear duplicate values so Excel merges beautifully
              for (let i = startR + 1; i < r; i++) grid[i][c] = '';
            }
            startR = r;
          }
        }
        if (grid.length - 1 > startR) {
          merges.push({ s: { r: startR, c }, e: { r: grid.length - 1, c } });
          for (let i = startR + 1; i < grid.length; i++) grid[i][c] = '';
        }
      }

      // Horizontal merges in col headers
      for (let r = 0; r < headerRowCount; r++) {
        let startC = rowHeaderColCount;
        for (let c = rowHeaderColCount + 1; c < grid[r].length; c++) {
          const val = grid[r][c];
          const prevVal = grid[r][startC];
          if (val !== prevVal && val !== '') {
            if (c - 1 > startC) {
              merges.push({ s: { r, c: startC }, e: { r, c: c - 1 } });
              for (let i = startC + 1; i < c; i++) grid[r][i] = '';
            }
            startC = c;
          }
        }
        if (grid[r].length - 1 > startC) {
          merges.push({ s: { r, c: startC }, e: { r, c: grid[r].length - 1 } });
          for (let i = startC + 1; i < grid[r].length; i++) grid[r][i] = '';
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(grid);
      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pivot Table');
      XLSX.writeFile(wb, 'pivot-table.xlsx');
    } catch (err) {
      console.error('Failed to export Excel', err);
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
      totals: {
        row: {
          subTotalsDimensions: rows,
          reverseLayout: true,
          reverseSubLayout: true,
        },
        col: {
          subTotalsDimensions: columns,
          reverseLayout: true,
          reverseSubLayout: true,
        },
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
          Export Excel
        </Button>
      </div>
      <div style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
        <SheetComponent ref={s2Ref as any} dataCfg={dataCfg} options={options as any} sheetType="pivot" adaptive={{ width: true, height: false }} />
      </div>
    </div>
  );
};
