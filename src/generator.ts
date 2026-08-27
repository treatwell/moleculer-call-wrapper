import {
  factory,
  createPrinter,
  isTypeReferenceNode,
  NewLineKind,
  NodeFlags,
  SyntaxKind,
  type ParameterDeclaration,
  type PropertySignature,
  type Statement,
  type TypeNode,
  type TypeParameterDeclaration,
} from 'typescript';
import { cloneNode } from 'ts-clone-node';
import { ActionRef, HandlerTypes, ImportMapping, Imports } from './types.js';
import { importMappingCloneHook, MOLECULER_NAME } from './utils.js';

const ParamsActions = 'Actions';
const HelperCallArgs = 'CallArgs';

/**
 * Return the first 2 parameters of any call function (ctx: Context, action: string) with a narrowed type
 * based on actionName and actionTypeGenericName
 */
function createWrapperParametersFirstPart(
  actionName: string | undefined,
  actionTypeGenericName: string | undefined,
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
  } else if (actionName) {
    actionParamType = factory.createLiteralTypeNode(
      factory.createStringLiteral(actionName, true),
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
  ];
}

/**
 * Create a helper type looking like this:
 * ```
 * type CallArgs<N extends keyof Actions> = Actions[N][0] extends undefined
 *   ? [params?: undefined, meta?: m.CallingOptions]
 *   : [params: Actions[N][0], meta?: m.CallingOptions];
 * ```
 */
function createCallArgHelperType(): Statement {
  return factory.createTypeAliasDeclaration(
    undefined,
    factory.createIdentifier(HelperCallArgs),
    [
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
        undefined,
      ),
    ],
    factory.createConditionalTypeNode(
      factory.createIndexedAccessTypeNode(
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
        factory.createLiteralTypeNode(factory.createNumericLiteral('0')),
      ),
      factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword),
      factory.createTupleTypeNode([
        factory.createNamedTupleMember(
          undefined,
          factory.createIdentifier('params'),
          factory.createToken(SyntaxKind.QuestionToken),
          factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword),
        ),
        factory.createNamedTupleMember(
          undefined,
          factory.createIdentifier('meta'),
          factory.createToken(SyntaxKind.QuestionToken),
          factory.createTypeReferenceNode(`${MOLECULER_NAME}.CallingOptions`),
        ),
      ]),
      factory.createTupleTypeNode([
        factory.createNamedTupleMember(
          undefined,
          factory.createIdentifier('params'),
          undefined,
          factory.createIndexedAccessTypeNode(
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
            factory.createLiteralTypeNode(factory.createNumericLiteral('0')),
          ),
        ),
        factory.createNamedTupleMember(
          undefined,
          factory.createIdentifier('meta'),
          factory.createToken(SyntaxKind.QuestionToken),
          factory.createTypeReferenceNode(`${MOLECULER_NAME}.CallingOptions`),
        ),
      ]),
    ),
  );
}

/**
 * Create the full list of parameters for simple overloads (with/without generics).
 */
function createWrapperParameters(
  actionName: string | undefined,
  params: TypeNode | undefined,
  importMapping: ImportMapping,
  actionTypeGenericName: string | undefined,
): ParameterDeclaration[] {
  return [
    ...createWrapperParametersFirstPart(actionName, actionTypeGenericName),
    factory.createParameterDeclaration(
      undefined,
      undefined,
      'params',
      params ? undefined : factory.createToken(SyntaxKind.QuestionToken),
      cloneNode(params, {
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

/**
 * Wrap any non Promise return type with a promise.
 */
function createWrapperReturnType(
  returnType: TypeNode | undefined,
  importMapping: ImportMapping,
): TypeNode {
  if (!returnType) {
    return factory.createTypeReferenceNode('Promise', [
      factory.createKeywordTypeNode(SyntaxKind.VoidKeyword),
    ]);
  }

  if (
    isTypeReferenceNode(returnType) &&
    returnType.getSourceFile() &&
    returnType.typeName.getText() === 'Promise'
  ) {
    return cloneNode(returnType, {
      hook: importMappingCloneHook(importMapping),
    });
  }
  return factory.createTypeReferenceNode('Promise', [
    cloneNode(returnType, { hook: importMappingCloneHook(importMapping) }),
  ]);
}

/**
 * Unwrap a Promise return type to its underlying type.
 *
 * Used for the Actions interface, where we want to store the return type of the action without the Promise wrapper.
 */
function createUnwrapReturnType(
  returnType: TypeNode | undefined,
  importMapping: ImportMapping,
): TypeNode {
  if (!returnType) {
    return factory.createKeywordTypeNode(SyntaxKind.VoidKeyword);
  }

  if (
    isTypeReferenceNode(returnType) &&
    returnType.getSourceFile() &&
    returnType.typeName.getText() === 'Promise' &&
    returnType.typeArguments?.length
  ) {
    return cloneNode(returnType.typeArguments[0], {
      hook: importMappingCloneHook(importMapping),
    });
  }
  return cloneNode(returnType, {
    hook: importMappingCloneHook(importMapping),
  });
}

function createWrapperTypeParameters(
  typeParameters: HandlerTypes['typeParameters'],
  importMapping: ImportMapping,
): TypeParameterDeclaration[] {
  if (!typeParameters) {
    return [];
  }
  return typeParameters.map(tp =>
    cloneNode(tp, { hook: importMappingCloneHook(importMapping) }),
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
    const importName = imports.get(importPath)!;

    stmts.push(
      factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
          SyntaxKind.TypeKeyword,
          undefined,
          factory.createNamespaceImport(factory.createIdentifier(importName)),
        ),
        factory.createStringLiteral(importPath, true),
      ),
    );
  }

  const sortedActions = actions.sort((a, b) =>
    a.actionName.localeCompare(b.actionName),
  );

  const actionsProperties: PropertySignature[] = [];

  stmts.push(
    factory.createInterfaceDeclaration(
      undefined,
      factory.createIdentifier(ParamsActions),
      undefined,
      undefined,
      actionsProperties,
    ),
  );

  const callTStmts: Statement[] = [];
  const callStmts: Statement[] = [];

  for (const action of sortedActions) {
    // If no generics, just add the action params and return type to the interface.
    if (!action.typeParameters?.length) {
      actionsProperties.push(
        factory.createPropertySignature(
          undefined,
          factory.createStringLiteral(action.actionName, true),
          undefined,
          factory.createTupleTypeNode([
            cloneNode(action.params, {
              hook: importMappingCloneHook(importMapping),
            }) || factory.createKeywordTypeNode(SyntaxKind.UndefinedKeyword),
            createUnwrapReturnType(action.returnType, importMapping),
          ]),
        ),
      );
    } else {
      // Otherwise, add overload signature to callT
      const templateTypes = createWrapperTypeParameters(
        action.typeParameters,
        importMapping,
      );
      const actionTemplateName = findUnusedTemplateName(action);

      // If action params, we need to wrap params in a conditional type
      // we also need to add a template params
      if (action.params) {
        action.params = factory.createConditionalTypeNode(
          factory.createTypeReferenceNode(
            factory.createIdentifier(actionTemplateName),
            undefined,
          ),
          factory.createLiteralTypeNode(
            factory.createStringLiteral(action.actionName, true),
          ),
          action.params,
          factory.createKeywordTypeNode(SyntaxKind.NeverKeyword),
        );
      }

      action.typeParameters = factory.createNodeArray([
        ...templateTypes,
        factory.createTypeParameterDeclaration(
          undefined,
          factory.createIdentifier(actionTemplateName),
          factory.createKeywordTypeNode(SyntaxKind.StringKeyword),
          factory.createLiteralTypeNode(
            factory.createStringLiteral(action.actionName, true),
          ),
        ),
      ]);

      callTStmts.push(
        factory.createFunctionDeclaration(
          [factory.createModifier(SyntaxKind.ExportKeyword)],
          undefined,
          'callT',
          createWrapperTypeParameters(action.typeParameters, importMapping),
          createWrapperParameters(
            action.actionName,
            action.params,
            importMapping,
            actionTemplateName,
          ),
          createWrapperReturnType(action.returnType, importMapping),
          undefined,
        ),
      );
    }
  }

  // Create call function, where we keep a single signature to improve auto-completion by TS language server
  callStmts.push(
    createCallArgHelperType(),
    factory.createFunctionDeclaration(
      [factory.createModifier(SyntaxKind.ExportKeyword)],
      undefined,
      'call',
      // Generic: <N extends keyof Actions>
      createWrapperTypeParameters(
        factory.createNodeArray([
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
        importMapping,
      ),
      [
        // Parameters: ctx: m.Context, action: N
        ...createWrapperParametersFirstPart(undefined, 'N'),
        // Parameter: ...args: CallArgs<N>
        factory.createParameterDeclaration(
          undefined,
          factory.createToken(SyntaxKind.DotDotDotToken),
          factory.createIdentifier('args'),
          undefined,
          factory.createTypeReferenceNode(
            factory.createIdentifier(HelperCallArgs),
            [
              factory.createTypeReferenceNode(
                factory.createIdentifier('N'),
                undefined,
              ),
            ],
          ),
          undefined,
        ),
      ],
      // Return type: Actions<[N][1]>
      createWrapperReturnType(
        factory.createIndexedAccessTypeNode(
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
        importMapping,
      ),
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
                factory.createIdentifier('args[0]'),
                factory.createIdentifier('args[1]'),
              ],
            ),
          ),
        ],
        true,
      ),
    ),
  );

  // Create callT function for generics. Completion will not work as well but should not have too much cases.
  // We skip it if no generics are used on the project
  if (callTStmts.length) {
    callTStmts.push(
      factory.createFunctionDeclaration(
        [factory.createModifier(SyntaxKind.ExportKeyword)],
        undefined,
        'callT',
        [],
        // ctx: m.Context, action: string, params: unknown, meta?: m.CallingOptions
        createWrapperParameters(
          undefined,
          factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
          importMapping,
          undefined,
        ),
        // Promise<unknown>
        createWrapperReturnType(
          factory.createKeywordTypeNode(SyntaxKind.UnknownKeyword),
          importMapping,
        ),
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
  }

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
    .replace(/type CallArgs/, '\ntype CallArgs')
    .replace(/export function call/, '\nexport function call')
    .replace(/export function callT/, '\nexport function callT');

  const eslintIgnoreRules = [
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-unused-vars',
  ];

  res = `/* eslint-disable ${eslintIgnoreRules.join(',')} */\n${res}`;
  return res;
}
