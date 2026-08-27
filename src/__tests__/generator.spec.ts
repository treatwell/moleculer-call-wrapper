import { describe, expect, it } from 'vitest';
import {
  createSourceFile,
  ScriptKind,
  ScriptTarget,
  SyntaxKind,
  TypeAliasDeclaration,
  type TypeNode,
  type TypeReferenceNode,
} from 'typescript';
import { buildCallWrapperFile } from '../generator.js';
import type { ActionRef, ImportMapping, Imports } from '../types.js';
import { addDepToImports } from '../utils.js';

function createTypeNode(code: string): TypeNode {
  const source = createSourceFile(
    'sample.ts',
    `type Sample = ${code};`,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );

  const typeAlias = source.statements[0];
  if (!typeAlias || typeAlias.kind !== SyntaxKind.TypeAliasDeclaration) {
    throw new Error('Sample type alias was not created');
  }
  return (typeAlias as TypeAliasDeclaration).type;
}

function createTypeParameters(code: string) {
  const source = createSourceFile(
    'sample.ts',
    `type Sample<${code}> = null;`,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );

  const typeAlias = source.statements[0];
  if (!typeAlias || typeAlias.kind !== SyntaxKind.TypeAliasDeclaration) {
    throw new Error('Sample generic type alias was not created');
  }
  return (typeAlias as TypeAliasDeclaration).typeParameters;
}

describe('buildCallWrapperFile', () => {
  it('should correctly inject the list of actions (imports not handled)', async () => {
    const imports: Imports = new Map();
    const importMapping: ImportMapping = new Map<TypeReferenceNode, string>();

    addDepToImports(imports, 'moleculer');

    const actions: ActionRef[] = [
      {
        actionName: 'calculator.sum',
        params: createTypeNode('SumParams'),
        returnType: createTypeNode('Promise<number>'),
      },
      {
        actionName: 'calculator.parseInt',
        params: createTypeNode('ParseIntParams'),
        returnType: createTypeNode('number'),
      },
      {
        actionName: 'calculator.getTenFirstPrimes',
        returnType: createTypeNode('Promise<number[]>'),
      },
      {
        actionName: 'manager.run',
        params: createTypeNode('RunParams'),
      },
      {
        actionName: 'generic.concat',
        params: createTypeNode('ConcatParams<T>'),
        returnType: createTypeNode('Promise<ConcatResponse<T>>'),
        typeParameters: createTypeParameters('T extends string | number'),
      },
      {
        actionName: 'generic.everything',
        returnType: createTypeNode('Promise<T>'),
        typeParameters: createTypeParameters('T extends string | number'),
      },
    ];

    await expect(
      buildCallWrapperFile(actions, imports, importMapping),
    ).toMatchFileSnapshot('generator-call-wrapper-no-imports.ts.snap');
  });
});
