# moleculer-call-wrapper

[![](https://cdn1.treatwell.net/images/view/v2.i1756348.w200.h50.x4965194E.jpeg)](https://treatwell.com/tech)

[![npm](https://img.shields.io/npm/v/@treatwell/moleculer-call-wrapper?style=flat-square)](https://www.npmjs.com/package/@treatwell/moleculer-call-wrapper)

This plugin intends to generate a TS file exporting a `call` function to replace `ctx.call` in your [moleculer](https://github.com/moleculerjs/moleculer) project
when using the [`@treatwell/moleculer-essentials`](https://github.com/treatwell/moleculer-essentials) package.

## Purpose

In _moleculer_, when you want to call an action from another service, you use `ctx.call('service.action', params)`.
With TypeScript, you don't have any type safety on the action name or the params you pass to it.

By using `@treatwell/moleculer-essentials`, you can safely define your actions with types, but
you still don't have type safety when calling them.

This package solves this by generating a `call` function with the correct types for each action in your project.
Here is an example of how it looks like:

```ts
// test.service.ts
import type { Context } from 'moleculer';
import { wrapService } from '@treatwell/moleculer-essentials';

export default wrapService({
  name: 'test',
  actions: {
    simpleaction: {
      async handler(ctx: Context<void>): Promise<void> {
        // ...
      },
    },
    withparams: {
      async handler(ctx: Context<{ id: number }>): Promise<void> {},
    },

    withresponse: {
      async handler(ctx: Context<void>): Promise<{ name: string }> {
        return { name: 'test' };
      },
    },

    withboth: {
      async handler(ctx: Context<{ id: number }>): Promise<{ name: string }> {
        return { name: 'test' };
      },
    },

    withtemplate: {
      async handler<T extends 'test' | 'other'>(
        ctx: Context<{ id: number; type: T }>,
      ): Promise<{ name: T }> {
        return { name: 'test' as T };
      },
    },
  },
});
```

```ts
/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unused-vars */
import type * as m from 'moleculer';

interface Actions {
  'test.withparams': [{ id: number }, unknown];
  'test.withboth': [{ id: number }, { name: string }];
}
interface ActionsU {
  'test.simpleaction': void;
  'test.withresponse': { name: string };
}

export function call<N extends keyof Actions>(
  ctx: m.Context,
  action: N,
  params: Actions[N][0],
  meta?: m.CallingOptions,
): Promise<Actions[N][1]>;
export function call<N extends keyof ActionsU>(
  ctx: m.Context,
  action: N,
  params?: undefined,
  meta?: m.CallingOptions,
): Promise<ActionsU[N]>;
export function call(
  ctx: m.Context,
  action: string,
  params: unknown,
  meta?: m.CallingOptions,
): Promise<unknown> {
  return ctx.call(action, params, meta);
}

export function callT<
  T extends 'test' | 'other',
  N extends string = 'test.withtemplate',
>(
  ctx: m.Context,
  action: N,
  params: N extends 'test.withtemplate' ? { id: number; type: T } : never,
  meta?: m.CallingOptions,
): Promise<{ name: T }>;
export function callT(
  ctx: m.Context,
  action: string,
  params: unknown,
  meta?: m.CallingOptions,
): Promise<unknown> {
  return ctx.call(action, params, meta);
}
```

Then you can just use it like this:

```ts
import { call, callT } from './call';
// ...

const res = await call(ctx, 'test.withresponse');

const tRes = await callT(ctx, 'test.withtemplate', {
  id: 1,
  type: 'test',
});
```

## Installation

Install `moleculer-call-wrapper` with your package manager:

```bash
  yarn add -D @treatwell/moleculer-call-wrapper
```

## Usage

To generate the wrapper file, you need to call the `createWrapperCall` function exported by the package and provide:

- `wrapperPath`: the path where you want to generate the file (e.g. `src/call.ts`)
- `services`: An array of _moleculer_ services (result from `broker.loadService(file)` for example)
- `svcFiles`: An array of those services file paths (**MUST** be in the same order as `services`)
- `additionalBuiltins`: An array of functions allowing you to add additional actions manually (see below)

Example:

```ts
import * as path from 'path';
import * as fs from 'fs';
import fg from 'fast-glob';
import {
  createServiceBroker,
  HealthCheckMiddleware,
  createLoggerConfig,
  defaultLogger,
  getMetadataFromService,
  isServiceSelected,
  Selector,
} from '@treatwell/moleculer-essentials';

async function run() {
  // In your case, you would probably use glob or similar to find your service files
  const serviceFiles = ['src/services/test.service.ts'];

  const broker = createServiceBroker({});
  const services = serviceFiles.map(f => broker.loadService(f));

  // This should be done on dev mode only, not in production
  if (process.env.MOLECULER_CALL_WRAPPER === 'yes') {
    import('@treatwell/moleculer-call-wrapper')
      .then(async ({ createWrapperCall }) => {
        return createWrapperCall(
          './lib/call.ts',
          services,
          serviceFiles,
          additionalBuiltins,
        );
      })
      .catch(err => {
        broker.logger.error('Error while creating call wrapper', err);
      });
  }

  await broker.start();
}

run().catch(err => {
  defaultLogger.error('Error while starting server', { err });
  process.exit(1);
});
```

## Builtins

Mixins can't be understood by the plugin natively. As a workaround,
it will try to match known mixins and generate related types for them.

It **only** concerns mixins that generates actions.

Mixins (namely the DatabaseMixin) present in the `@treatwell/moleculer-essentials` package are automatically included.

### Create your own builtins

To create your own builtins, you can take a look at this [file](./src/builtins/db-mixin-v2.ts).

The idea is to first check if the service is using the related mixin.
If it is, the builtin will have to:

- Fill the related action (in the `actions` array) with TS types.
- Add any imports used in those TS types with the `addDepToImports` function to the `context.imports` map.

To help you with TS factory and AST, you can use https://ts-ast-viewer.com/

## License

[MIT](https://choosealicense.com/licenses/mit/)
