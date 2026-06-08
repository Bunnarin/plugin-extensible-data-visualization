# @bunnarin/plugin-extensible-data-visualization
Just like @nocobase/plugin-data-visualization, but comes with a pivot table and you can actually add your own chart
```
import { chartFlowRegistry } from '@bunnarin/plugin-extensible-data-visualization/client';

chartFlowRegistry.register('radar', {
  labelKey: 'Radar',
  fieldSpecs: [...],
  autoFillRules: { first: 'indicator', second: 'value' },
  genRaw: (builder) => `return { series: [{ type: 'radar', ... }] }`,
});

```