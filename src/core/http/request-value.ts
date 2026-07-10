/** Clone request data without converting Node.js Buffers into Uint8Arrays. */
export function cloneRequestValue<Value>(value: Value): Value {
  return cloneRequestValueInternal(value, new WeakSet<object>());
}

function cloneRequestValueInternal<Value>(value: Value, ancestors: WeakSet<object>): Value {
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as Value;
  if (value instanceof Date) return new Date(value.getTime()) as Value;
  if (value instanceof ArrayBuffer) return value.slice(0) as Value;
  if (ArrayBuffer.isView(value)) return structuredClone(value);

  if (ancestors.has(value)) {
    throw new TypeError('Cyclic request values are not supported');
  }
  ancestors.add(value);

  const prototype: unknown = Object.getPrototypeOf(value);
  try {
    if (Array.isArray(value)) {
      const items = value as unknown[];
      return items.map((item) => cloneRequestValueInternal(item, ancestors)) as Value;
    }
    if (prototype === Object.prototype || prototype === null) {
      const cloned: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value)) {
        cloned[key] = cloneRequestValueInternal(nested, ancestors);
      }
      return cloned as Value;
    }
  } finally {
    ancestors.delete(value);
  }

  const constructorName = Object.prototype.toString.call(value).slice(8, -1);
  throw new TypeError(`Unsupported request value type: ${constructorName}`);
}

/** Recursively freeze cloned request data while leaving typed-array storage intact. */
export function deepFreezeRequestValue<Value>(value: Value): Value {
  return deepFreezeRequestValueInternal(value, new WeakSet<object>());
}

function deepFreezeRequestValueInternal<Value>(value: Value, visited: WeakSet<object>): Value {
  if (
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer ||
    Object.isFrozen(value)
  ) {
    return value;
  }
  if (visited.has(value)) return value;
  visited.add(value);
  for (const nested of Object.values(value)) deepFreezeRequestValueInternal(nested, visited);
  return Object.freeze(value);
}
