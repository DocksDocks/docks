/**
 * JSON primitives for EngineNative: the `Json` value type, object narrowing,
 * jq-compatible codepoint ordering, and a parse that yields `undefined`
 * instead of throwing.
 */

import type { JsonObject } from "./sharedTypes";

export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export function isObject(v: Json): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** jq's string order: compare by Unicode codepoint, not UTF-16 code unit. */
export function compareCodepoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ra = ia.next();
    const rb = ib.next();
    if (ra.done && rb.done) return 0;
    if (ra.done) return -1;
    if (rb.done) return 1;
    const ca = ra.value.codePointAt(0)!;
    const cb = rb.value.codePointAt(0)!;
    if (ca !== cb) return ca - cb;
  }
}

/** jq `empty` validation: parse or null. */
export function parseJson(text: string): Json | undefined {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return undefined;
  }
}
