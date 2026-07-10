/** Clone request data without converting Node.js Buffers into Uint8Arrays. */
export function cloneRequestValue<Value>(value: Value): Value {
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as Value;
  if (Array.isArray(value)) {
    const items = value as unknown[];
    return items.map((item) => cloneRequestValue(item)) as Value;
  }
  if (value instanceof Date) return new Date(value.getTime()) as Value;
  if (value instanceof ArrayBuffer) return value.slice(0) as Value;
  if (ArrayBuffer.isView(value)) return structuredClone(value);

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    const cloned: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) cloned[key] = cloneRequestValue(nested);
    return cloned as Value;
  }

  return structuredClone(value);
}

/** Recursively freeze cloned request data while leaving typed-array storage intact. */
export function deepFreezeRequestValue<Value>(value: Value): Value {
  if (
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreezeRequestValue(nested);
  return Object.freeze(value);
}
