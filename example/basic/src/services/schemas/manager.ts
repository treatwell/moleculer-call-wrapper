import { z } from 'zod';

export const RunParams = z.object({});

export type RunParams = z.infer<typeof RunParams>;
