import type {
  NodeArray,
  SourceFile,
  TypeNode,
  TypeParameterDeclaration,
  TypeReferenceNode,
} from 'typescript';
import type { Service } from 'moleculer';

export type HandlerTypes = {
  params?: TypeNode;
  returnType?: TypeNode;
  typeParameters?: NodeArray<TypeParameterDeclaration>;
};

export type ActionRef = HandlerTypes & {
  actionName?: string;
};

export type Imports = Map<string, string>;

export type ImportMapping = Map<TypeReferenceNode, string>;

export type InjectBuiltinFn = (
  context: CallWrapperContext,
  actions: ActionRef[],
  service: Service,
  sourceFile: SourceFile,
) => void;

export type CallWrapperContext = {
  imports: Imports;
  wrapperPath: string;
  currentFilePath: string;
  importMapping: ImportMapping;
  // Builtins to be injected in the parsing process
  builtins: InjectBuiltinFn[];
};
