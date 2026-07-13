import type { StreamEvent, StreamEventType } from "../../core/types.js";

export type StreamSink = (event: StreamEvent) => void;

/** Builds a typed emitter bound to a sink (an SSE writer or WS socket send). */
export function createEmitter(sink: StreamSink) {
  return function emit(type: StreamEventType, message: string, data?: Record<string, unknown>) {
    sink({ type, message, data, timestamp: new Date().toISOString() });
  };
}

export type Emit = ReturnType<typeof createEmitter>;

export const noopEmit: Emit = () => {};
