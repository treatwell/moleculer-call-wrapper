import { wrapService } from '@treatwell/moleculer-essentials';
import { Context } from 'moleculer';
import { ConcatParams, ConcatResponse } from './schemas/generic.js';

export default wrapService({
  name: 'generic',

  actions: {
    concat: {
      async handler<T extends string | number>(
        ctx: Context<ConcatParams<T>>,
      ): Promise<ConcatResponse<T>> {
        const { a, b } = ctx.params;
        if (typeof a === 'string' && typeof b === 'string') {
          return (a + b) as T;
        }
        if (typeof a === 'number' && typeof b === 'number') {
          return (a + b) as T;
        }
        throw new Error('Parameters must be of the same type');
      },
    },

    everything: {
      async handler<T extends string | number>(ctx: Context): Promise<T> {
        return 'hello' as T;
      },
    },
  },
});
