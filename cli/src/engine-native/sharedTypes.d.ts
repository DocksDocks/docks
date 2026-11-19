/**
 * EngineNative shared shapes: each cross-cutting data shape is defined once
 * here so pipelines import one canonical definition instead of redeclaring
 * structurally identical anonymous types. Types only — no runtime code.
 */
import type { Json } from "./jq";

/** Manifest-record object: the `{ [key]: Json }` shape redeclared across manifest readers. */
export type JsonObject = { [key: string]: Json };

/**
 * omp session model (moved from harnesses.ts, which re-exports it so existing
 * import paths keep working).
 */
export interface OmpSessionModel {
  readonly selector: string;
  // Session ceiling; absent when the model publishes no ladder, so no
  // invented level ever reaches a selector that omp must resolve.
  readonly thinking?: string;
}

/** Injected HTTP client: the subset of fetch the network lookups call. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
