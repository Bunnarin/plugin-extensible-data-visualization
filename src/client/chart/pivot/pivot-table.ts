import { Chart } from '../chart';
import { RenderProps, ChartType } from '../chart';
import { FieldOption } from '../../hooks';
import { PivotTable } from './PivotTable';

export class PivotTableChart extends Chart {
  constructor() {
    super({
      name: 'pivot-table',
      title: 'Pivot Table',
      enableAdvancedConfig: true,
      Component: PivotTable,
      config: [
        {
          configType: 'field',
          name: 'rows',
          title: 'Rows',
          required: false,
        },
        {
          configType: 'field',
          name: 'columns',
          title: 'Columns',
          required: false,
        },
        {
          configType: 'field',
          name: 'values',
          title: 'Values',
          required: false,
        },
        {
          configType: 'field',
          name: 'showRowTotals',
          title: 'Row Grand Totals',
          required: false,
        },
        {
          configType: 'field',
          name: 'showRowSubTotals',
          title: 'Row Sub Totals',
          required: false,
        },
        {
          configType: 'field',
          name: 'rowSubTotalsDimensions',
          title: 'Row Sub Total Dimensions',
          required: false,
        },
        {
          configType: 'field',
          name: 'showColTotals',
          title: 'Column Grand Totals',
          required: false,
        },
        {
          configType: 'field',
          name: 'showColSubTotals',
          title: 'Column Sub Totals',
          required: false,
        },
        {
          configType: 'field',
          name: 'colSubTotalsDimensions',
          title: 'Column Sub Total Dimensions',
          required: false,
        },
      ],
    });
  }

  /**
   * Override the schema getter to emit multi-select field pickers for
   * rows / columns / values.
   */
  get schema() {
    return {
      type: 'object',
      properties: {
        rows: {
          title: 'Rows',
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          'x-component-props': { mode: 'multiple', allowClear: true },
          'x-reactions': '{{ useChartFields }}',
        },
        columns: {
          title: 'Columns',
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          'x-component-props': { mode: 'multiple', allowClear: true },
          'x-reactions': '{{ useChartFields }}',
        },
        values: {
          title: 'Values',
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          'x-component-props': { mode: 'multiple', allowClear: true },
          'x-reactions': '{{ useChartFields }}',
        },
        showRowTotals: {
          title: 'Row Grand Totals',
          type: 'boolean',
          'x-decorator': 'FormItem',
          'x-component': 'Checkbox',
          'x-content': 'Show Row Grand Totals',
        },
        showRowSubTotals: {
          title: 'Row Sub Totals',
          type: 'boolean',
          'x-decorator': 'FormItem',
          'x-component': 'Checkbox',
          'x-content': 'Show Row Sub Totals',
        },
        rowSubTotalsDimensions: {
          title: 'Row Sub Total Dimensions',
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          'x-component-props': { mode: 'multiple', allowClear: true, placeholder: 'Leave empty for all rows' },
          'x-reactions': '{{ useChartFields }}',
        },
        showColTotals: {
          title: 'Column Grand Totals',
          type: 'boolean',
          'x-decorator': 'FormItem',
          'x-component': 'Checkbox',
          'x-content': 'Show Column Grand Totals',
        },
        showColSubTotals: {
          title: 'Column Sub Totals',
          type: 'boolean',
          'x-decorator': 'FormItem',
          'x-component': 'Checkbox',
          'x-content': 'Show Column Sub Totals',
        },
        colSubTotalsDimensions: {
          title: 'Column Sub Total Dimensions',
          type: 'array',
          'x-decorator': 'FormItem',
          'x-component': 'Select',
          'x-component-props': { mode: 'multiple', allowClear: true, placeholder: 'Leave empty for all columns' },
          'x-reactions': '{{ useChartFields }}',
        },
      },
    };
  }

  init: ChartType['init'] = (fields: FieldOption[], { measures, dimensions }) => {
    const { yFields } = this.infer(fields, { measures, dimensions });
    return {
      general: {
        rows: dimensions?.map((d) => {
          if (typeof d.field === 'string') return d.alias || d.field;
          return d.alias || d.field?.join('.');
        }) || [],
        columns: [],
        values: yFields?.map((f) => f?.value).filter(Boolean) || [],
      },
    };
  };

  getProps({ data, fieldProps, general, advanced }: RenderProps): any {
    const rows: string[] = general?.rows || [];
    const columns: string[] = general?.columns || [];
    const values: string[] = general?.values || [];

    const fieldLabels: Record<string, string> = {};
    Object.entries(fieldProps).forEach(([key, val]: [string, any]) => {
      if (val?.label) fieldLabels[key] = val.label;
    });

    return {
      data,
      rows,
      columns,
      values,
      fieldLabels,
      showRowTotals: general?.showRowTotals,
      showRowSubTotals: general?.showRowSubTotals,
      rowSubTotalsDimensions: general?.rowSubTotalsDimensions,
      showColTotals: general?.showColTotals,
      showColSubTotals: general?.showColSubTotals,
      colSubTotalsDimensions: general?.colSubTotalsDimensions,
      ...advanced,
    };
  }

  getReference() {
    return {
      title: 'AntV S2',
      link: 'https://s2.antv.antgroup.com',
    };
  }
}
