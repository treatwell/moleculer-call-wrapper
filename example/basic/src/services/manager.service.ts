import {
  createOpenAPIResponses,
  wrapService,
} from '@treatwell/moleculer-essentials';
import { Context } from 'moleculer';
import { z } from 'zod';
import { RunParams } from './schemas/manager.js';
import { call } from '../call.js';

export default wrapService({
  name: 'manager',
  settings: {
    rest: '/manager',
  },

  actions: {
    run: {
      visibility: 'published',
      rest: 'GET /run',
      openapi: createOpenAPIResponses(z.int()),
      params: RunParams,
      async handler(ctx: Context<RunParams>) {
        const resA = await call(ctx, 'calculator.getTenFirstPrimes');
        const resB = await call(ctx, 'calculator.sum', { a: 1, b: 2 });

        ctx.logger.info('Run action called');
        return resA;
      },
    },
  },
});
