export type ConcatParams<T extends string | number> = {
  a: T;
  b: T;
};

export type ConcatResponse<T> = T;
