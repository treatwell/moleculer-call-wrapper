import {
  createSourceFile,
  isMethodDeclaration,
  isPropertyAssignment,
  isTypeReferenceNode,
  ScriptTarget,
  type Node,
  type SourceFile,
  type TypeNode,
} from 'typescript';
import { readFileSync } from 'node:fs';
import type { Service } from 'moleculer';
import type { ActionRef, CallWrapperContext, HandlerTypes } from './types.js';
import { fillImports } from './utils.js';

export function parseService(
  context: CallWrapperContext,
  service: Service,
): ActionRef[] {
  const actions: ActionRef[] = [];
  const sourceFile = createSourceFile(
    'service.ts',
    readFileSync(context.currentFilePath, 'utf8'),
    ScriptTarget.ESNext,
    true,
  );

  const handlers = findActionsTypes(context, sourceFile);
  const version = service.version ? `v${service.version}.` : '';

  Object.entries(service.schema.actions || {}).forEach(
    ([actionName, action]) => {
      if (
        action === false ||
        (typeof action === 'object' && action.visibility === 'private')
      ) {
        return;
      }
      const { params, returnType, typeParameters } =
        handlers.get(actionName) || {};

      if (typeParameters) {
        typeParameters.forEach(tp => fillImports(context, sourceFile, tp));
      }
      if (returnType) {
        fillImports(context, sourceFile, returnType);
      }
      if (params) {
        fillImports(context, sourceFile, params);
      }
      actions.push({
        actionName: `${version}${service.name}.${actionName}`,
        params,
        returnType,
        typeParameters,
      });
    },
  );

  context.builtins.forEach(injectBuiltin =>
    injectBuiltin(context, actions, service, sourceFile),
  );

  return actions;
}

function findActionsTypes(
  context: CallWrapperContext,
  sourceFile: SourceFile,
): Map<string, HandlerTypes> {
  const handlers = new Map<string, HandlerTypes>();

  function visit(n: Node): void {
    if (
      !isMethodDeclaration(n) ||
      n.name.getText() !== 'handler' ||
      n.parameters.length !== 1
    ) {
      return n.forEachChild(visit);
    }

    if (!isPropertyAssignment(n.parent.parent)) {
      return n.forEachChild(visit);
    }

    const ctxType = n.parameters[0].type;
    if (!ctxType || !isTypeReferenceNode(ctxType)) {
      return n.forEachChild(visit);
    }

    let paramsType: TypeNode | undefined;

    if (
      ctxType.typeArguments?.length &&
      ctxType.typeArguments[0].getText() !== 'never'
    ) {
      [paramsType] = ctxType.typeArguments;
    }

    handlers.set(n.parent.parent.name.getText(), {
      params: paramsType,
      returnType: n.type,
      typeParameters: n.typeParameters,
    });
    return undefined;
  }

  sourceFile.forEachChild(visit);
  return handlers;
}
