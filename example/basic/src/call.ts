/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unused-vars */
import type * as m from 'moleculer';
import type * as s78e4172 from './services/schemas/calculator.js';
import type * as s34d79cd from './services/schemas/generic.js';
import type * as s85b29b3 from './services/schemas/manager.js';

interface Actions {
    'api.listAliases': [
        undefined,
        void
    ];
    'calculator.getTenFirstPrimes': [
        undefined,
        number[]
    ];
    'calculator.multiply': [
        s78e4172.MultiplyParams,
        void
    ];
    'calculator.parseInt': [
        s78e4172.ParseIntParams,
        number
    ];
    'calculator.sum': [
        s78e4172.SumParams,
        number
    ];
    'manager.run': [
        s85b29b3.RunParams,
        void
    ];
    'openapi.generateDocs': [
        undefined,
        void
    ];
    'openapi.ui': [
        undefined,
        void
    ];
}

type CallArgs<N extends keyof Actions> = Actions[N][0] extends undefined ? [
    params?: undefined,
    meta?: m.CallingOptions
] : [
    params: Actions[N][0],
    meta?: m.CallingOptions
];

export function call<N extends keyof Actions>(ctx: m.Context, action: N, ...args: CallArgs<N>): Promise<Actions[N][1]> {
    return ctx.call(action, args[0], args[1]);
}

export function callT<T extends string | number, N extends string = "generic.concat">(ctx: m.Context, action: N, params: N extends "generic.concat" ? s34d79cd.ConcatParams<T> : never, meta?: m.CallingOptions): Promise<s34d79cd.ConcatResponse<T>>;
export function callT<T extends string | number, N extends string = "generic.everything">(ctx: m.Context, action: N, params?: undefined, meta?: m.CallingOptions): Promise<T>;
export function callT(ctx: m.Context, action: string, params: unknown, meta?: m.CallingOptions): Promise<unknown> {
    return ctx.call(action, params, meta);
}
