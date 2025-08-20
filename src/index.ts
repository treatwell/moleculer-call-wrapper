import type { TypeReferenceNode } from 'typescript';
import type { Service } from 'moleculer';
import { writeFile, readFile } from 'node:fs/promises';
import { parseService } from './parser.js';
import { buildCallWrapperFile } from './generator.js';
import { addDepToImports, fillImports } from './utils.js';
import { injectDatabaseMixinV2Builtins } from './builtins/db-mixin-v2.js';
import type {
  ActionRef,
  CallWrapperContext,
  InjectBuiltinFn,
} from './types.js';

/**
 * Create a TS file that add typings to the call method of the Moleculer service.
 * It works by creating a new call method that replace the ctx.call method.
 *
 * @param wrapperPath Path to the file that will be created
 * @param services List of services to be parsed
 * @param svcFiles List of those services file paths (must be in the same order as services)
 * @param additionalBuiltins List of additional builtins to be injected. By default, it includes the database mixin v2.
 */
export async function createWrapperCall(
  wrapperPath: string,
  services: Service[],
  svcFiles: string[],
  additionalBuiltins: InjectBuiltinFn[],
) {
  const currentContent = await readFile(wrapperPath, 'utf8');

  const importMapping = new Map<TypeReferenceNode, string>();
  const imports = new Map<string, string>();
  addDepToImports(imports, 'moleculer');

  const builtins = [injectDatabaseMixinV2Builtins, ...additionalBuiltins];

  const actions = services.flatMap((svc, idx) =>
    parseService(
      {
        imports,
        currentFilePath: svcFiles[idx],
        wrapperPath,
        importMapping,
        builtins,
      },
      svc,
    ),
  );

  const wrapper = buildCallWrapperFile(actions, imports, importMapping);
  if (currentContent !== wrapper && wrapper.trim()) {
    await writeFile(wrapperPath, wrapper);
  }
}

export {
  addDepToImports,
  fillImports,
  type ActionRef,
  type CallWrapperContext,
};
