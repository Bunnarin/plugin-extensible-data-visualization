/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Context, Next } from '@nocobase/actions';
import { BelongsToArrayAssociation, Field, FilterParser } from '@nocobase/database';
import compose from 'koa-compose';
import { Cache } from '@nocobase/cache';
import { middlewares } from '@nocobase/server';
import { QueryParams } from '../types';
import { createQueryParser } from '../query-parser';
import { assign } from '@nocobase/utils';
import { checkFilterParams, NoPermissionError } from '@nocobase/acl';
// @ts-ignore
import { resolveVariablesTemplate } from '@nocobase/plugin-flow-engine';

const getDB = (ctx: Context, dataSource: string) => {
  const ds = ctx.app.dataSourceManager.dataSources.get(dataSource);
  return ds?.collectionManager.db;
};

const getChartQueryPermission = async (ctx: Context, collection: string, acl: any) => {
  const actionCtx: any = {
    app: ctx.app,
    db: ctx.db,
    database: ctx.database ?? ctx.db,
    getCurrentRepository: ctx.getCurrentRepository,
    request: ctx.request,
    req: ctx.req,
    action: {
      actionName: 'list',
      name: 'list',
      params: {},
      resourceName: collection,
      mergeParams() {},
    },
    state: {
      ...ctx.state,
      currentRole: ctx.state.currentRole,
      currentRoles: ctx.state.currentRoles,
      currentUser: ctx.state.currentUser?.toJSON ? ctx.state.currentUser.toJSON() : ctx.state.currentUser,
    },
    permission: {},
    throw(...args) {
      ctx.throw(...args);
    },
  };

  await acl.getActionParams(actionCtx);

  return actionCtx.permission;
};

export const postProcess = async (ctx: Context, next: Next) => {
  const { data, fieldMap } = ctx.action.params.values as {
    data: any[];
    fieldMap: { [source: string]: { type?: string } };
  };
  ctx.body = data.map((record) => {
    Object.entries(record).forEach(([key, value]) => {
      if (!value) {
        return;
      }
      const { type } = fieldMap[key] || {};
      switch (type) {
        case 'bigInt':
        case 'integer':
        case 'float':
        case 'double':
        case 'decimal':
          record[key] = Number(value);
          break;
      }
    });
    return record;
  });
  await next();
};

export const queryData = async (ctx: Context, next: Next) => {
  const { dataSource, collection, queryParams, fieldMap } = ctx.action.params.values;
  const db = getDB(ctx, dataSource) || ctx.db;
  const model = db.getModel(collection);
  const data = await model.findAll(queryParams);
  ctx.action.params.values = {
    data,
    fieldMap,
  };
  await next();
  // if (!sql) {
  //   return await repository.find(parseBuilder(ctx, { collection, measures, dimensions, orders, filter, limit }));
  // }

  // const statement = `SELECT ${sql.fields} FROM ${collection} ${sql.clauses}`;
  // const [data] = await ctx.db.sequelize.query(statement);
  // return data;
};

export const parseFieldAndAssociations = async (ctx: Context, next: Next) => {
  const {
    dataSource,
    collection: collectionName,
    measures,
    dimensions,
    orders,
    filter,
  } = ctx.action.params.values as QueryParams;
  const db = getDB(ctx, dataSource) || ctx.db;
  const collection = db.getCollection(collectionName);
  const fields = collection.fields;
  const associations = collection.model.associations;

  // Nested include tree: supports multi-level associations like program.faculty.name
  // Structure: { [assocName]: { type, children: { ... } } }
  const includeTree: Record<string, { type: string; targetCollection: string; children: Record<string, any> }> = {};

  const ensureIncludePath = (segments: string[], currentCollection: any, currentFields: any) => {
    let tree = includeTree;
    let col = currentCollection;
    let flds = currentFields;

    for (const seg of segments) {
      if (!tree[seg]) {
        const assocField = flds.get(seg) as Field;
        const assocType = assocField?.type || 'belongsTo';
        tree[seg] = { type: assocType, targetCollection: assocField?.target, children: {} };
      }
      const targetCollectionName = tree[seg].targetCollection;
      if (targetCollectionName) {
        col = db.getCollection(targetCollectionName);
        flds = col?.fields;
      }
      tree = tree[seg].children;
    }
  };

  const parseField = (selected: { field: string | string[]; alias?: string }) => {
    let fieldPath: string[];
    if (!Array.isArray(selected.field)) {
      fieldPath = [selected.field];
    } else {
      fieldPath = selected.field;
    }

    if (fieldPath.length === 1) {
      // Simple field on the root collection — no association
      const name = fieldPath[0];
      const rawAttributes = collection.model.getAttributes();
      const field = `${collectionName}.${rawAttributes[name]?.field || name}`;
      const fieldType = fields.get(name)?.type;
      const fieldOptions = fields.get(name)?.options;
      return {
        ...selected,
        field,
        name,
        type: fieldType,
        options: fieldOptions,
        alias: selected.alias || name,
      };
    }

    // Multi-level association path, e.g. ['program', 'faculty', 'name']
    // The last segment is the actual field; everything before is the association chain.
    const assocSegments = fieldPath.slice(0, -1); // ['program', 'faculty']
    const leafName = fieldPath[fieldPath.length - 1]; // 'name'

    // Walk the association chain to find the final target collection and register includes
    ensureIncludePath(assocSegments, collection, fields);

    let currentCol = collection;
    let currentFields = fields;
    for (const seg of assocSegments) {
      const assocField = currentFields.get(seg) as Field;
      if (assocField?.target) {
        currentCol = db.getCollection(assocField.target);
        currentFields = currentCol.fields;
      }
    }

    const leafFieldType = currentFields.get(leafName)?.type;
    const leafFieldOptions = currentFields.get(leafName)?.options;
    const leafRawField = currentCol.model.getAttributes()[leafName]?.field || leafName;

    // For Sequelize col(): intermediate associations use ->, final association uses .
    // e.g. for ['program', 'faculty', 'name']:  "program->faculty.name"
    const colParts = assocSegments.length > 1
      ? assocSegments.slice(0, -1).join('->') + '->' + assocSegments[assocSegments.length - 1]
      : assocSegments[0];
    const field = `${colParts}.${leafRawField}`;

    const dotName = [...assocSegments, leafName].join('.');

    return {
      ...selected,
      field,
      name: dotName,
      type: leafFieldType,
      options: leafFieldOptions,
      alias: selected.alias || dotName,
    };
  };

  const parsedMeasures = measures?.map(parseField) || [];
  const parsedDimensions = dimensions?.map(parseField) || [];
  const parsedOrders = orders?.map(parseField) || [];

  // Convert the includeTree into Sequelize nested include format
  const buildIncludes = (tree: Record<string, any>): any[] => {
    return Object.entries(tree).map(([assocName, node]) => {
      const options: any = {
        association: assocName,
        attributes: [],
      };
      if (node.type === 'belongsToMany') {
        options.through = { attributes: [] };
      }
      if (node.type === 'belongsToArray') {
        const assoc = associations[assocName] as BelongsToArrayAssociation;
        if (assoc) {
          Object.assign(options, assoc.generateInclude());
        }
      }
      const childIncludes = buildIncludes(node.children);
      if (childIncludes.length > 0) {
        options.include = childIncludes;
      }
      return options;
    });
  };
  const include = buildIncludes(includeTree);

  const filterParser = new FilterParser(filter, {
    collection,
  });
  const { where, include: filterInclude } = filterParser.toSequelizeParams();
  if (filterInclude) {
    // Remove attributes from through table
    const stack = [...filterInclude];
    while (stack.length) {
      const item = stack.pop();

      const parentCollection = db.getCollection(item.parentCollection || collectionName);
      const field = parentCollection.fields.get(item.association);
      if (field?.type === 'belongsToMany') {
        item.through = { attributes: [] };
      }
      if (field?.target && item.include?.length) {
        for (const child of item.include) {
          child.parentCollection = field.target;
          stack.push(child);
        }
      }
    }
  }
  ctx.action.params.values = {
    ...ctx.action.params.values,
    where,
    measures: parsedMeasures,
    dimensions: parsedDimensions,
    orders: parsedOrders,
    include: [...include, ...(filterInclude || [])],
  };
  await next();
};

export const parseVariables = async (ctx: Context, next: Next) => {
  const { mode, contextParams, ...values } = ctx.action.params.values as QueryParams;
  if (mode !== 'sql') {
    const resolvedValues = await resolveVariablesTemplate(ctx as any, values as any, contextParams || {});
    ctx.action.params.values = {
      ...ctx.action.params.values,
      ...(resolvedValues as Record<string, any>),
    };
  }

  const { filter } = ctx.action.params.values;
  ctx.action.params.filter = filter;
  await middlewares.parseVariables(ctx, async () => {
    ctx.action.params.values.filter = ctx.action.params.filter;
    await next();
  });
};

export const cacheMiddleware = async (ctx: Context, next: Next) => {
  const { uid, cache: cacheConfig, refresh } = ctx.action.params.values as QueryParams;
  const cache = ctx.app.cacheManager.getCache('data-visualization') as Cache;
  const useCache = cacheConfig?.enabled && uid;

  if (useCache && !refresh) {
    const data = await cache.get(uid);
    if (data) {
      ctx.body = data;
      return;
    }
  }
  await next();
  if (useCache) {
    await cache.set(uid, ctx.body, cacheConfig?.ttl * 1000);
  }
};

export const checkPermission = async (ctx: Context, next: Next) => {
  const { collection, dataSource } = ctx.action.params.values as QueryParams;
  const acl = ctx.app.dataSourceManager.get(dataSource)?.acl || ctx.app.acl;
  const permission = await getChartQueryPermission(ctx, collection, acl);
  const filterParams = permission?.parsedParams?.filter;

  if (filterParams) {
    try {
      checkFilterParams(ctx.database.getCollection(collection), filterParams);
    } catch (e) {
      if (e instanceof NoPermissionError) {
        ctx.throw(403, 'No permissions');
      }
    }
    const filter = ctx.action.params.values.filter || {};
    ctx.action.params.values = {
      ...ctx.action.params.values,
      filter: assign(filter, filterParams, {
        filter: 'andMerge',
      }),
    };
  }
  return next();
};

export const query = async (ctx: Context, next: Next) => {
  const { dataSource } = ctx.action.params.values as QueryParams;
  const db = getDB(ctx, dataSource) || ctx.db;
  const queryParser = createQueryParser(db);
  try {
    await compose([
      checkPermission,
      cacheMiddleware,
      parseVariables,
      parseFieldAndAssociations,
      queryParser.parse(),
      queryData,
      postProcess,
    ])(ctx, next);
  } catch (err) {
    ctx.throw(500, err);
  }
};
