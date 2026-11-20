import { GENERATED_PAYLOAD_PATHS, GENERATED_PAYLOAD_TEXT } from "./generated/sotPayload";

export type PayloadPath = (typeof GENERATED_PAYLOAD_PATHS)[number];

export function payloadText(path: PayloadPath): string {
  return GENERATED_PAYLOAD_TEXT[path];
}

export function payloadBytes(path: PayloadPath): Buffer {
  return Buffer.from(payloadText(path));
}

export function payloadPaths(prefix: string): ReadonlyArray<PayloadPath> {
  return GENERATED_PAYLOAD_PATHS.filter((path) => path.startsWith(prefix));
}

export function payloadDisplayPath(path: PayloadPath): string {
  return `embedded:${path}`;
}
