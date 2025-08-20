import {
  factory,
  createPrinter,
  isTypeReferenceNode,
  NewLineKind,
  NodeFlags,
  SyntaxKind,
  type Block,
  type FunctionDeclaration,
  type ParameterDeclaration,
  type PropertySignature,
  type Statement,
  type TypeNode,
  type TypeParameterDeclaration,
} from 'typescript';
import { cloneNode } from 'ts-clone-node';
import type { ActionRef, ImportMapping, Imports } from './types.js';
import { importMappingCloneHook, MOLECULER_NAME } from './utils.js';

const ParamsActions = 'Actions';
const NoParamsActions = 'ActionsU';

function createWrapperParameters(
  action: ActionRef,
  importMapping: ImportMapping,
  actionTypeGenericName?: string,
): ParameterDeclaration[] {
  // 3 cases:
  //  - A generic Name (default)
  //  - String literal (if no params)
  //  - string keyword (if no actionName)
  let actionParamType;
  if (actionTypeGenericName) {
    actionParamType = factory.createTypeReferenceNode(
      factory.createIdentifier(actionTypeGenericName),
      undefined,
    );
  } else if (action.actionName) {
    actionParamType = factory.createLiteralTypeNode(
      factory.createStringLiteral(action.actionName, true),
    );
  } else {
    actionParamType = factory.createKeywordTypeNode(SyntaxKind.StringKeyword);
  }

  return [
    factory.createParameterDeclaration(
      undefined,
      undefined,
      'ctx',
      undefined,
      factory.createTypeReferenceNode(`${MOLECULER_NAME}.Context`),
    ),
    factory.createParameterDeclaration(
      undefined,
      undefined,
      'action',
      undefined,
      actionParamType,
    ),
    factory.createParameterDeclaration(
      undefined,
      undefined,
      'params',
      action.params ? undefined : factory.createToken(SyntaxKind.QuestionToken),
      cloneNode(action.params, {
        hook: importMappingCloneHook(importMapping),
      }) || factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword),
    ),
    factory.createParameterDeclaration(
      undefined,
      undefined,
      'meta',
      factory.createToken(SyntaxKind.QuestionToken),
      factory.createTypeReferenceNode(`${MOLECULER_NAME}.CallingOptions`),
    ),
  ];
}

function createWrapperReturnType(
  action: ActionRef,
  importMapping: ImportMapping,
): TypeNode {
  if (!action.returnType) {
    return factory.createTypeReferenceNode('Promise', [
      factory.createKeywordTypeNode(SyntaxKind.VoidKeyword),
    ]);
  }

  if (
    isTypeReferenceNode(action.returnType) &&
    action.returnType.getSourceFile() &&
    action.returnType.typeName.getText() === 'Promise'
  ) {
    return cloneNode(action.returnType, {
      hook: importMappingCloneHook(importMapping),
    });
  }
  return factory.createTypeReferenceNode('Promise', [
    cloneNode(action.returnType, {
      hook: importMappingCloneHook(importMapping),
    }),
  ]);
}

function createUnwrapReturnType(
  action: ActionRef,
  importMapping: ImportMapping,
): TypeNode {
  if (!action.returnType) {
    return factory.createKeywordTypeNode(SyntaxKind.VoidKeyword);
  }

  if (
    isTypeReferenceNode(action.returnType) &&
    action.returnType.getSourceFile() &&
    action.returnType.typeName.getText() === 'Promise' &&
    action.returnType.typeArguments?.length
  ) {
    return cloneNode(action.returnType.typeArguments[0], {
      hook: importMappingCloneHook(importMapping),
    });
  }
  return cloneNode(action.returnType, {
    hook: importMappingCloneHook(importMapping),
  });
}

function createWrapperTypeParameters(
  action: ActionRef,
  importMapping: ImportMapping,
): TypeParameterDeclaration[] {
  if (!action.typeParameters) {
    return [];
  }
  return action.typeParameters.map(tp =>
    cloneNode(tp, { hook: importMappingCloneHook(importMapping) }),
  );
}

function createWrapperFunctionOverload(
  action: ActionRef,
  importMapping: ImportMapping,
  name: 'call' | 'callT',
  actionTypeGenericName?: string,
  block?: Block,
): FunctionDeclaration {
  return factory.createFunctionDeclaration(
    [factory.createModifier(SyntaxKind.ExportKeyword)],
    undefined,
    name,
    createWrapperTypeParameters(action, importMapping),
    createWrapperParameters(action, importMapping, actionTypeGenericName),
    createWrapperReturnType(action, importMapping),
    block,
  );
}

/**
 * Simple function that will find the first Template Name that isn't used.
 * For now, it only adds 'N' chars until it isn't found in other types.
 */
function findUnusedTemplateName(action: ActionRef): string {
  const typeNames = new Set(action.typeParameters?.map(t => t.name.getText()));

  let actionTemplateName = 'N';
  while (typeNames.has(actionTemplateName)) {
    actionTemplateName += 'N';
  }
  return actionTemplateName;
}

export function buildCallWrapperFile(
  actions: Array<ActionRef>,
  imports: Imports,
  importMapping: ImportMapping,
): string {
  const stmts: Statement[] = [];

  let sortedImports = [...imports.keys()].sort();
  sortedImports = [
    ...sortedImports.filter(d => d.startsWith('@')),
    ...sortedImports.filter(d => !d.startsWith('.') && !d.startsWith('@')),
    ...sortedImports.filter(d => d.startsWith('.')),
  ];

  for (const importPath of sortedImports) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const importName = imports.get(importPath)!;

    stmts.push(
      factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
          true,
          undefined,
          factory.createNamespaceImport(factory.createIdentifier(importName)),
        ),
        factory.createStringLiteral(importPath, true),
      ),
    );
  }

  const sortedActions = actions.sort((a, b) =>
    (a.actionName || '').localeCompare(b.actionName || ''),
  );

  const actionsProperties: PropertySignature[] = [];
  const actionsNoParamsProperties: PropertySignature[] = [];

  stmts.push(
    factory.createInterfaceDeclaration(
      undefined,
      factory.createIdentifier(ParamsActions),
      undefined,
      undefined,
      actionsProperties,
    ),
  );

  stmts.push(
    factory.createInterfaceDeclaration(
      undefined,
      factory.createIdentifier(NoParamsActions),
      undefined,
      undefined,
      actionsNoParamsProperties,
    ),
  );

  const callTStmts: Statement[] = [];
  const callStmts: Statement[] = [];

  for (const action of sortedActions) {
    if (action.typeParameters?.length) {
      const templateTypes = createWrapperTypeParameters(action, importMapping);
      // If action params, we need to wrap params in a conditional type
      // we also need to add a template params
      if (action.params) {
        const actionTemplateName = findUnusedTemplateName(action);
        action.params = factory.createConditionalTypeNode(
          factory.createTypeReferenceNode(
            factory.createIdentifier(actionTemplateName),
            undefined,
          ),
          factory.createLiteralTypeNode(
            factory.createStringLiteral(action.actionName || '', true),
          ),
          action.params,
          factory.createKeywordTypeNode(SyntaxKind.NeverKeyword),
        );
        action.typeParameters = factory.createNodeArray([
          ...templateTypes,
          factory.createTypeParameterDeclaration(
            undefined,
            factory.createIdentifier(actionTemplateName),
            factory.createKeywordTypeNode(SyntaxKind.StringKeyword),
            factory.createLiteralTypeNode(
              factory.createStringLiteral(action.actionName || '', true),
            ),
          ),
        ]);
        callTStmts.push(
          createWrapperFunctionOverload(
            action,
            importMapping,
            'callT',
            actionTemplateName,
          ),
        );
      } else {
        callStmts.push(
          createWrapperFunctionOverload(action, importMapping, 'call'),
        );
      }
    } else if (action.params) {
      actionsProperties.push(
        factory.createPropertySignature(
          undefined,
          factory.createStringLiteral(action.actionName || '', true),
          undefined,
          factory.createTupleTypeNode([
            cloneNode(action.params, {
              hook: importMappingCloneHook(importMapping),
            }),
            createUnwrapReturnType(action, importMapping),
          ]),
        ),
      );
    } else {
      actionsNoParamsProperties.push(
        factory.createPropertySignature(
          undefined,
          factory.createStringLiteral(action.actionName || '', true),
          undefined,
          createUnwrapReturnType(action, importMapping),
        ),
      );
    }
  }

  // First generic overload, for standard actions with params and returnType
  callStmts.push(
    createWrapperFunctionOverload(
      {
        typeParameters: factory.createNodeArray([
          factory.createTypeParameterDeclaration(
            undefined,
            factory.createIdentifier('N'),
            factory.createTypeOperatorNode(
              SyntaxKind.KeyOfKeyword,
              factory.createTypeReferenceNode(
                factory.createIdentifier(ParamsActions),
                undefined,
              ),
            ),
          ),
        ]),
        params: factory.createIndexedAccessTypeNode(
          factory.createIndexedAccessTypeNode(
            factory.createTypeReferenceNode(
              factory.createIdentifier(ParamsActions),
            ),
            factory.createTypeReferenceNode(factory.createIdentifier('N')),
          ),
          factory.createLiteralTypeNode(factory.createNumericLiteral('0')),
        ),
        returnType: factory.createIndexedAccessTypeNode(
          factory.createIndexedAccessTypeNode(
            factory.createTypeReferenceNode(
              factory.createIdentifier(ParamsActions),
              undefined,
            ),
            factory.createTypeReferenceNode(
              factory.createIdentifier('N'),
              undefined,
            ),
          ),
          factory.createLiteralTypeNode(factory.createNumericLiteral('1')),
        ),
      },
      importMapping,
      'call',
      'N',
    ),
  );

  // Second generic overload, for actions without params
  callStmts.push(
    createWrapperFunctionOverload(
      {
        typeParameters: factory.createNodeArray([
          factory.createTypeParameterDeclaration(
            undefined,
            factory.createIdentifier('N'),
            factory.createTypeOperatorNode(
              SyntaxKind.KeyOfKeyword,
              factory.createTypeReferenceNode(
                factory.createIdentifier(NoParamsActions),
                undefined,
              ),
            ),
          ),
        ]),
        returnType: factory.createIndexedAccessTypeNode(
          factory.createTypeReferenceNode(
            factory.createIdentifier(NoParamsActions),
            undefined,
          ),
          factory.createTypeReferenceNode(
            factory.createIdentifier('N'),
            undefined,
          ),
        ),
      },
      importMapping,
      'call',
      'N',
    ),
  );

  // Create function base implementations
  callStmts.push(
    createWrapperFunctionOverload(
      {
        params: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        returnType: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
      },
      importMapping,
      'call',
      undefined,
      factory.createBlock(
        [
          factory.createReturnStatement(
            factory.createCallExpression(
              factory.createPropertyAccessExpression(
                factory.createIdentifier('ctx'),
                factory.createIdentifier('call'),
              ),
              undefined,
              [
                factory.createIdentifier('action'),
                factory.createIdentifier('params'),
                factory.createIdentifier('meta'),
              ],
            ),
          ),
        ],
        true,
      ),
    ),
  );
  callTStmts.push(
    createWrapperFunctionOverload(
      {
        params: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
        returnType: factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
      },
      importMapping,
      'callT',
      undefined,
      factory.createBlock(
        [
          factory.createReturnStatement(
            factory.createCallExpression(
              factory.createPropertyAccessExpression(
                factory.createIdentifier('ctx'),
                factory.createIdentifier('call'),
              ),
              undefined,
              [
                factory.createIdentifier('action'),
                factory.createIdentifier('params'),
                factory.createIdentifier('meta'),
              ],
            ),
          ),
        ],
        true,
      ),
    ),
  );

  const printer = createPrinter({ newLine: NewLineKind.LineFeed });
  const sourceFile = factory.createSourceFile(
    [...stmts, ...callStmts, ...callTStmts],
    factory.createToken(SyntaxKind.EndOfFileToken),
    NodeFlags.Const,
  );
  let res = printer.printFile(sourceFile);
  // Add an empty line between imports and functions.
  res = res
    .replace(/interface Actions/, '\ninterface Actions')
    .replace(/export function call/, '\nexport function call')
    .replace(/export function callT/, '\nexport function callT');

  const eslintIgnoreRules = [
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-unused-vars',
  ];

  res = `/* eslint-disable ${eslintIgnoreRules.join(',')} */\n${res}`;
  return res;
}
