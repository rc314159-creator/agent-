export interface VoiceprintProfile {
  id: string;
  name: string;
  vector: number[];
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceprintMatch {
  profile: VoiceprintProfile;
  score: number;
}

const STORAGE_KEY = "meetflow.voiceprintProfiles.v1";
const VECTOR_SIZE = 24;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) return Array(vector.length).fill(0);
  return vector.map((value) => value / magnitude);
}

function frameFeatures(frame: Float32Array, sampleRate: number): number[] {
  let energy = 0;
  let zeroCrossings = 0;
  let weightedFrequency = 0;
  let spectralEnergy = 0;
  const bins = 12;
  const bandEnergy = Array(bins).fill(0);

  for (let i = 0; i < frame.length; i++) {
    const sample = frame[i];
    energy += sample * sample;
    if (i > 0 && Math.sign(sample) !== Math.sign(frame[i - 1])) zeroCrossings++;
  }

  // Lightweight spectral sketch. It is intentionally small so it can run in
  // the browser without native DSP dependencies.
  for (let k = 1; k <= bins; k++) {
    let real = 0;
    let imag = 0;
    const frequency = 80 + k * 180;
    for (let n = 0; n < frame.length; n++) {
      const angle = (2 * Math.PI * frequency * n) / sampleRate;
      real += frame[n] * Math.cos(angle);
      imag -= frame[n] * Math.sin(angle);
    }
    const magnitude = Math.sqrt(real * real + imag * imag) / frame.length;
    bandEnergy[k - 1] = Math.log1p(magnitude);
    spectralEnergy += magnitude;
    weightedFrequency += magnitude * frequency;
  }

  const rms = Math.sqrt(energy / frame.length);
  const zcr = zeroCrossings / frame.length;
  const centroid = spectralEnergy > 0 ? weightedFrequency / spectralEnergy / 3000 : 0;
  return [Math.log1p(rms * 100), zcr, centroid, ...bandEnergy];
}

export function extractVoiceprint(samples: Float32Array, sampleRate: number): number[] | null {
  const minSamples = Math.floor(sampleRate * 1.2);
  if (samples.length < minSamples) return null;

  const frameSize = Math.max(512, Math.floor(sampleRate * 0.04));
  const hop = Math.floor(frameSize / 2);
  const frames: number[][] = [];

  for (let start = 0; start + frameSize <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + frameSize);
    const rms = Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length);
    if (rms < 0.008) continue;
    frames.push(frameFeatures(frame, sampleRate));
  }

  if (frames.length < 4) return null;

  const columns = frames[0].map((_, index) => frames.map((frame) => frame[index]));
  const summary = columns.flatMap((column) => {
    const avg = mean(column);
    return [avg, std(column, avg)];
  });

  const padded = summary.slice(0, VECTOR_SIZE);
  while (padded.length < VECTOR_SIZE) padded.push(0);
  return normalize(padded);
}

export function averageVoiceprints(vectors: number[][]): number[] | null {
  const valid = vectors.filter((vector) => vector.length > 0);
  if (valid.length === 0) return null;
  const size = valid[0].length;
  const averaged = Array(size).fill(0);
  for (const vector of valid) {
    for (let i = 0; i < size; i++) averaged[i] += vector[i] ?? 0;
  }
  return normalize(averaged.map((value) => value / valid.length));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    a2 += a[i] * a[i];
    b2 += b[i] * b[i];
  }
  if (a2 === 0 || b2 === 0) return 0;
  return dot / Math.sqrt(a2 * b2);
}

export function loadVoiceprintProfiles(): VoiceprintProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveVoiceprintProfiles(profiles: VoiceprintProfile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function findVoiceprintMatch(
  vector: number[],
  profiles: VoiceprintProfile[],
  threshold = 0.82
): VoiceprintMatch | null {
  let best: VoiceprintMatch | null = null;
  for (const profile of profiles) {
    const score = cosineSimilarity(vector, profile.vector);
    if (!best || score > best.score) best = { profile, score };
  }
  return best && best.score >= threshold ? best : null;
}

export function upsertVoiceprintProfile(
  profiles: VoiceprintProfile[],
  name: string,
  vector: number[],
  profileId?: string
): VoiceprintProfile[] {
  const now = new Date().toISOString();
  const existingIndex = profiles.findIndex((profile) => profile.id === profileId || profile.name === name);
  if (existingIndex >= 0) {
    const existing = profiles[existingIndex];
    const sampleCount = existing.sampleCount + 1;
    const merged = normalize(
      existing.vector.map((value, index) => ((value * existing.sampleCount) + (vector[index] ?? 0)) / sampleCount)
    );
    const next = [...profiles];
    next[existingIndex] = { ...existing, name, vector: merged, sampleCount, updatedAt: now };
    return next;
  }

  return [
    ...profiles,
    {
      id: crypto.randomUUID(),
      name,
      vector,
      sampleCount: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
