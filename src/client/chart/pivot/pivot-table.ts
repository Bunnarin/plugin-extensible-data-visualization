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
