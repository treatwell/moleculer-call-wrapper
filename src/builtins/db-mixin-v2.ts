import type { Service } from 'moleculer';
import {
  factory,
  isCallExpression,
  SyntaxKind,
  type SourceFile,
  type Node,
  type TypeNode,
} from 'typescript';
import type { ActionRef, CallWrapperContext } from '../types.js';
import { addDepToImports, fillImports } from '../utils.js';

export function injectDatabaseMixinV2Builtins(
  context: CallWrapperContext,
  actions: ActionRef[],
  service: Service,
  sourceFile: SourceFile,
): void {
  const dbMixin = service.originalSchema.mixins?.find(
    m => m.methods?._getDatabaseMixinCollection,
  );

  if (!dbMixin) {
    return;
  }

  const types = findDatabaseMixinTypes(context, sourceFile);
  if (!types) {
    return;
  }

  const typeArguments = types.tenantField
    ? [types.entityType, types.tenantField]
    : [types.entityType];

  const version = service.version ? `v${service.version}.` : '';
  const dbActions = actions
    .filter(a => a.actionName?.startsWith(`${version}${service.name}.`))
    .filter(a => !a.params || !a.returnType);

  const importName = addDepToImports(
    context.imports,
    '@treatwell/moleculer-essentials/mixins/database',
  );

  for (const action of dbActions) {
    const actionName = action.actionName?.replace(
      `${version}${service.name}.`,
      '',
    );
    if (!action.params) {
      switch (actionName) {
        case 'find':
        case 'findStream': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionFindParams`,
            typeArguments,
          );
          break;
        }
        case 'getInternal': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionGetInternalParams`,
            typeArguments,
          );
          break;
        }
        case 'get': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionGetParams`,
            typeArguments,
          );
          break;
        }
        case 'countInternal': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionCountInternalParams`,
            typeArguments,
          );
          break;
        }
        case 'count': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionCountParams`,
            typeArguments,
          );
          break;
        }
        case 'list': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionListParams`,
            typeArguments,
          );
          break;
        }
        case 'create': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionCreateParams`,
            [types.entityType],
          );
          break;
        }
        case 'update': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionUpdateParams`,
            typeArguments,
          );
          break;
        }
        case 'remove': {
          action.params = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionRemoveParams`,
            typeArguments,
          );
          break;
        }
        default:
          break;
      }
    }

    if (!action.returnType) {
      switch (actionName) {
        case 'find': {
          action.returnType = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionFindResult`,
            [types.entityType],
          );
          break;
        }
        case 'findStream': {
          const streamImportName = addDepToImports(context.imports, 'stream');
          action.returnType = factory.createTypeReferenceNode(
            `${streamImportName}.Readable`,
          );
          break;
        }
        case 'countInternal':
        case 'count': {
          action.returnType = factory.createKeywordTypeNode(
            SyntaxKind.NumberKeyword,
          );
          break;
        }
        case 'list': {
          action.returnType = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionListResult`,
            [types.entityType],
          );
          break;
        }
        case 'create':
        case 'update':
        case 'remove':
        case 'getInternal':
        case 'get': {
          action.returnType = factory.createTypeReferenceNode(
            `${importName}.DatabaseActionEntityResult`,
            [types.entityType],
          );
          break;
        }
        default:
          break;
      }
    }
  }
}

function findDatabaseMixinTypes(
  context: CallWrapperContext,
  sourceFile: SourceFile,
) {
  let res: { entityType: TypeNode; tenantField?: TypeNode } | undefined;

  function visit(n: Node): void {
    if (
      !isCallExpression(n) ||
      n.expression.getText() !== 'DatabaseMethodsMixin'
    ) {
      n.forEachChild(visit);
      return;
    }
    if (!n.typeArguments?.length) {
      return;
    }
    res = { entityType: n.typeArguments[0], tenantField: n.typeArguments[1] };
  }

  visit(sourceFile);

  if (res) {
    fillImports(context, sourceFile, res.entityType);
    if (res.tenantField) {
      fillImports(context, sourceFile, res.tenantField);
    }
  }
  return res;
}
