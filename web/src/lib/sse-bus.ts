import { EventEmitter } from "events";

// HMR-safe singleton: same pattern as db.ts globalForDb
const g = globalThis as unknown as { __sseBus?: EventEmitter };
if (!g.__sseBus) {
  g.__sseBus = new EventEmitter();
  g.__sseBus.setMaxListeners(200);
}
const bus = g.__sseBus;

export interface UtteranceEvent {
  utteranceId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  confidence: number;
  needsReview: boolean;
  startMs: number;
  endMs: number;
}

export function emitUtterance(meetingId: string, data: UtteranceEvent) {
  bus.emit(`meeting:${meetingId}`, data);
}

export function subscribeMeeting(meetingId: string, cb: (data: UtteranceEvent) => void): () => void {
  bus.on(`meeting:${meetingId}`, cb);
  return () => bus.off(`meeting:${meetingId}`, cb);
}
