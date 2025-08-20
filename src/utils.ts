import { dirname, relative, resolve } from 'node:path';
import crypto from 'node:crypto';
import {
  isNamedImports,
  isTypeReferenceNode,
  type SourceFile,
  type Node,
  isImportDeclaration,
  factory,
  isQualifiedName,
} from 'typescript';
import type { CloneNodeHook } from 'ts-clone-node';
import type { CallWrapperContext, ImportMapping, Imports } from './types.js';

export const MOLECULER_NAME = 'm';

export function fillImports(
  context: CallWrapperContext,
  sourceFile: SourceFile,
  node: Node,
): void {
  node.forEachChild(n => fillImports(context, sourceFile, n));

  if (!isTypeReferenceNode(node)) {
    return;
  }

  let nodeName = node.typeName.getText();
  if (isQualifiedName(node.typeName)) {
    nodeName = node.typeName.left.getText();
  }

  let importName: string = node.typeName.getText();

  const importDeclaration = sourceFile.statements
    .filter(isImportDeclaration)
    .find(n => {
      if (
        n.importClause?.namedBindings &&
        isNamedImports(n.importClause.namedBindings)
      ) {
        const importIdentifier = n.importClause.namedBindings.elements.find(
          c => c.name.getText() === nodeName,
        );

        // Handle import { A as B } from './file'
        if (importIdentifier?.propertyName) {
          importName = importIdentifier.propertyName.getText();
        }
        return !!importIdentifier;
      }
      return false;
    });

  if (importDeclaration) {
    let key = importDeclaration.moduleSpecifier.getText().slice(1, -1);

    if (key.startsWith('.')) {
      key = `./${relative(
        dirname(context.wrapperPath),
        resolve(dirname(context.currentFilePath), key),
      ).replace(/\\/g, '/')}`;
    }

    const name = addDepToImports(context.imports, key);

    context.importMapping.set(node, `${name}.${importName}`);
  }
}

function getUniqueNameFromKey(key: string): string {
  switch (key) {
    case '@wavyapp/wavy-sdk':
      return 'sdk';
    case 'moleculer':
      return MOLECULER_NAME;
    default:
      if (/^[a-zA-Z]\w+$/.test(key)) {
        return key;
      }
      return `s${crypto
        .createHash('sha1')
        .update(key)
        .digest('hex')
        .slice(0, 7)}`;
  }
}

export function addDepToImports(imports: Imports, key: string): string {
  let name = imports.get(key);
  if (!name) {
    // Keep stable imports
    name = getUniqueNameFromKey(key);
    imports.set(key, name);
  }
  return name;
}

export function importMappingCloneHook<N extends Node>(
  importMapping: ImportMapping,
) {
  return (n: N) => {
    // Only touch type references
    if (isTypeReferenceNode(n) && importMapping.has(n)) {
      return {
        typeName: () => factory.createIdentifier(importMapping.get(n)!),
      } as unknown as CloneNodeHook<N>;
    }
    return undefined;
  };
}
