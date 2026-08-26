import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Button, message, Switch } from 'antd';
import { SheetComponent } from '@antv/s2-react';
import '@antv/s2-react/dist/style.min.css';
import type { S2DataConfig, S2Options, SpreadSheet } from '@antv/s2';
import { copyData, S2Event } from '@antv/s2';
import { DownloadOutlined, CopyOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

export type PivotTableProps = {
  data: Record<string, any>[];
  rows?: string[];
  columns?: string[];
  values?: string[];
  aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max';
  fieldLabels?: Record<string, string>;
  showRowTotals?: boolean;
  showRowSubTotals?: boolean;
  rowSubTotalsDimensions?: string[];
  showColTotals?: boolean;
  showColSubTotals?: boolean;
  colSubTotalsDimensions?: string[];
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
  showRowTotals = false,
  showRowSubTotals = false,
  rowSubTotalsDimensions = [],
  showColTotals = false,
  showColSubTotals = false,
  colSubTotalsDimensions = [],
  ...rest
}) => {
  const s2Ref = useRef<SpreadSheet>();
  const containerRef = useRef<HTMLDivElement>(null);

  const [rowSubTotalsOn, setRowSubTotalsOn] = useState(showRowSubTotals);
  const [colSubTotalsOn, setColSubTotalsOn] = useState(showColSubTotals);
  useEffect(() => setRowSubTotalsOn(showRowSubTotals), [showRowSubTotals]);
  useEffect(() => setColSubTotalsOn(showColSubTotals), [showColSubTotals]);

  // Available width of the page/container we're allowed to fill
  const [containerWidth, setContainerWidth] = useState<number>();
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setContainerWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Natural width the table actually needs, measured from S2 after each layout pass
  const [contentWidth, setContentWidth] = useState<number>();
  useEffect(() => {
    const sheet = s2Ref.current;
    if (!sheet) return;
    const measure = () => {
      try {
        const { layoutResult } = sheet.facet;
        const rowsWidth = layoutResult?.rowsHierarchy?.width ?? 0;
        const colsWidth = layoutResult?.colsHierarchy?.width ?? 0;
        const natural = Math.ceil(rowsWidth + colsWidth);
        if (natural > 0) {
          setContentWidth((prev) => (prev === natural ? prev : natural));
        }
      } catch {
        // ignore measurement errors
      }
    };
    sheet.on(S2Event.LAYOUT_AFTER_RENDER, measure);
    return () => {
      sheet.off(S2Event.LAYOUT_AFTER_RENDER, measure);
    };
  }, []);

  // Until content width is known, default to full container width (avoids the
  // "stuck at S2's 600px default" bug). Once known, hug content but never
  // exceed the available container width.
  const effectiveWidth = useMemo(() => {
    if (!containerWidth) return contentWidth;
    if (!contentWidth) return containerWidth;
    return Math.min(contentWidth, containerWidth);
  }, [containerWidth, contentWidth]);

  const buildGridAndMerges = () => {
    if (!s2Ref.current) return null;
    const tsvString = copyData(s2Ref.current, '\t', false);
    const headerRowCount = columns.length + (values.length > 1 || !columns.length ? 1 : 0);
    const rowHeaderColCount = rows.length;

    const grid = tsvString.split(/\r?\n/).map((line, rIndex) => line.split('\t').map((c, cIndex) => {
      let v: string | number = c.replace(/^"|"$/g, '');
      const isDataCell = rIndex >= headerRowCount && cIndex >= rowHeaderColCount;

      if (isDataCell && (v === 'null' || v === '-')) v = 0;
      else if (v === 'null') v = 'N/A';
      else if (v !== '' && !isNaN(Number(v))) v = Number(v);

      return v;
    }));

    const merges: XLSX.Range[] = [];

    for (let c = 0; c < rowHeaderColCount; c++) {
      let startR = headerRowCount;
      for (let r = headerRowCount + 1; r < grid.length; r++) {
        const val = grid[r][c];
        const prevVal = grid[startR][c];
        if (val !== prevVal && val !== '') {
          if (r - 1 > startR) {
            merges.push({ s: { r: startR, c }, e: { r: r - 1, c } });
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

    return { grid, merges };
  };

  const handleDownload = () => {
    try {
      const data = buildGridAndMerges();
      if (!data) return;

      const { grid, merges } = data;
      const ws = XLSX.utils.aoa_to_sheet(grid);
      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pivot Table');
      XLSX.writeFile(wb, 'pivot-table.xlsx');
    } catch (err) {
      console.error('Failed to export Excel', err);
    }
  };

  const handleCopy = () => {
    try {
      const data = buildGridAndMerges();
      if (!data) return;

      const { grid, merges } = data;
      const ws = XLSX.utils.aoa_to_sheet(grid);
      ws['!merges'] = merges;

      const tableHTML = XLSX.utils.sheet_to_html(ws);
      const fullHTML = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office'
              xmlns:w='urn:schemas-microsoft-com:office:excel'
              xmlns='https://www.w3.org/TR/html40'>
              <head>
                  <meta charset='utf-8'>
                  <style>
                      @page Section1 {
                          size: 841.9pt 595.3pt;
                          mso-page-orientation: landscape;
                          margin: 1in 1in 1in 1in;
                      }
                      div.Section1 { page: Section1; }
                      table { border-collapse: collapse; }
                      td, th { border: 1px solid #ddd; padding: 4px; }
                  </style>
              </head>
              <body>
                  <div class="Section1">
                      ${tableHTML}
                  </div>
              </body>
          </html>
      `;

      navigator.clipboard.writeText(fullHTML).then(() => {
        message.success('Table copied to clipboard');
      }).catch(err => {
        console.error('Clipboard write failed', err);
        message.error('Failed to copy to clipboard');
      });
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const aggregatedData = useMemo(() => {
    if (!data.length || (!rows.length && !columns.length)) return data;

    const grouped = new Map<string, any>();

    data.forEach(row => {
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
          if (aggregation === 'avg') item[alias] += numVal;
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

  const options: S2Options = useMemo(() => {
    const s2Aggregation = (aggregation === 'avg' ? 'AVG' : aggregation === 'min' ? 'MIN' : aggregation === 'max' ? 'MAX' : 'SUM') as any;

    return {
      width: effectiveWidth,
      height: 480,
      style: { layoutWidthType: 'compact' },
      interaction: { selectedCellsSpotlight: true, hoverHighlight: true },
      totals: {
        row: {
          showGrandTotals: showRowTotals,
          showSubTotals: rowSubTotalsOn,
          subTotalsDimensions: rowSubTotalsDimensions.length > 0 ? rowSubTotalsDimensions : rows,
          reverseLayout: false,
          reverseSubLayout: false,
          label: 'Total',
          subLabel: 'Total',
          calcTotals: { aggregation: s2Aggregation },
          calcSubTotals: { aggregation: s2Aggregation },
        },
        col: {
          showGrandTotals: showColTotals,
          showSubTotals: colSubTotalsOn,
          subTotalsDimensions: colSubTotalsDimensions.length > 0 ? colSubTotalsDimensions : columns,
          reverseLayout: false,
          reverseSubLayout: false,
          label: 'Total',
          subLabel: 'Total',
          calcTotals: { aggregation: s2Aggregation },
          calcSubTotals: { aggregation: s2Aggregation },
        },
      },
      ...rest,
    };
  }, [
    rest, effectiveWidth, showRowTotals, rowSubTotalsOn, rowSubTotalsDimensions, rows,
    showColTotals, colSubTotalsOn, colSubTotalsDimensions, columns, aggregation,
  ]);

  if (!rows.length && !values.length) {
    return <div style={{ padding: 16, color: '#888' }}>Configure rows and values to display the pivot table.</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Switch size="small" checked={rowSubTotalsOn} onChange={setRowSubTotalsOn} disabled={!rows.length} />
          Row subtotals
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Switch size="small" checked={colSubTotalsOn} onChange={setColSubTotalsOn} disabled={!columns.length} />
          Column subtotals
        </label>
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>Copy to Excel</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>Export Excel</Button>
      </div>
      <div style={{ width: effectiveWidth ? `${effectiveWidth}px` : '100%', overflow: 'hidden' }}>
        <SheetComponent
          ref={s2Ref as any}
          dataCfg={dataCfg}
          options={options as any}
          sheetType="pivot"
          adaptive={{ width: false, height: false }}
        />
      </div>
    </div>
  );
};