export type PartiallyNullable<T> = {
  [P in keyof T]?: T[P] | null;
}

