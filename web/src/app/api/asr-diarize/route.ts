import { NextRequest } from "next/server";
import { apiLogger } from "@/lib/logger";

// Post-processing diarization via DashScope Paraformer-v2 录音文件识别 API.
// Flow: client POSTs WAV binary → we upload to DashScope temp OSS → submit
// async task with diarization_enabled → poll → fetch transcription_url →
// return segments with speaker_id. Same DASHSCOPE_API_KEY as the realtime
// path.
//
// Docs:
//   - 临时上传: https://help.aliyun.com/zh/model-studio/get-temporary-file-url
//   - 录音文件识别: https://help.aliyun.com/zh/model-studio/paraformer-recorded-speech-recognition-restful-api

const log = apiLogger("asr-diarize");

const MODEL = "paraformer-v2";
const UPLOAD_POLICY_URL = `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=${MODEL}`;
const TASK_SUBMIT_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription";
const TASK_QUERY_URL =
  "https://dashscope.aliyuncs.com/api/v1/tasks"; // /{task_id}

interface UploadPolicy {
  request_id: string;
  data: {
    policy: string;
    signature: string;
    upload_dir: string;
    upload_host: string;
    expire_in_seconds: number;
    max_file_size_mb: number;
    oss_access_key_id: string;
    x_oss_object_acl: string;
    x_oss_forbid_overwrite: string;
  };
}

interface TaskSubmitResponse {
  output: { task_status: string; task_id: string };
  request_id: string;
}

interface TaskQueryResponse {
  output: {
    task_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
    task_id: string;
    results?: Array<{
      file_url: string;
      subtask_status?: string;
      transcription_url?: string;
      code?: string;
      message?: string;
    }>;
  };
}

interface ParaformerWord {
  begin_time: number;
  end_time: number;
  text: string;
  punctuation?: string;
  speaker_id?: number;
}

interface ParaformerSentence {
  begin_time: number;
  end_time: number;
  text: string;
  speaker_id?: number;
  words?: ParaformerWord[];
}

interface ParaformerTranscription {
  file_url: string;
  properties?: Record<string, unknown>;
  transcripts?: Array<{
    channel_id?: number;
    content_duration_in_milliseconds?: number;
    text?: string;
    sentences?: ParaformerSentence[];
  }>;
}

interface DiarizedSegment {
  speakerId: number;
  text: string;
  beginTime: number; // ms
  endTime: number; // ms
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function getUploadPolicy(apiKey: string): Promise<UploadPolicy["data"]> {
  const res = await fetch(UPLOAD_POLICY_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`upload policy failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as UploadPolicy;
  return json.data;
}

async function uploadToOss(
  policy: UploadPolicy["data"],
  wav: Buffer,
  filename: string
): Promise<string> {
  // Full object key: upload_dir + "/" + filename
  const key = `${policy.upload_dir}/${filename}`;

  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  const ab = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
  form.append("file", new Blob([ab], { type: "audio/wav" }), filename);

  const res = await fetch(policy.upload_host, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`oss upload failed: ${res.status} ${body}`);
  }
  return `oss://${key}`;
}

async function submitTask(
  apiKey: string,
  ossUrl: string,
  speakerCount: number
): Promise<string> {
  const body = {
    model: MODEL,
    input: { file_urls: [ossUrl] },
    parameters: {
      diarization_enabled: true,
      speaker_count: speakerCount,
      language_hints: ["zh"],
    },
  };
  const res = await fetch(TASK_SUBMIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`submit failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as TaskSubmitResponse;
  return json.output.task_id;
}

async function pollTask(
  apiKey: string,
  taskId: string,
  maxWaitMs = 180000
): Promise<TaskQueryResponse["output"]> {
  const start = Date.now();
  let delay = 1500;
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${TASK_QUERY_URL}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`query failed: ${res.status} ${txt}`);
    }
    const json = (await res.json()) as TaskQueryResponse;
    const status = json.output.task_status;
    if (status === "SUCCEEDED") return json.output;
    if (status === "FAILED") {
      throw new Error(`task failed: ${JSON.stringify(json.output)}`);
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay + 500, 3000);
  }
  throw new Error("task timeout");
}

async function fetchTranscription(url: string): Promise<ParaformerTranscription> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch transcription failed: ${res.status}`);
  return (await res.json()) as ParaformerTranscription;
}

/**
 * Collapse adjacent same-speaker sentences into one segment regardless of
 * pause length. A speaker's turn stays together as a single bubble until
 * a DIFFERENT speaker takes over — this matches how users read a meeting
 * transcript. If the same speaker is interrupted and comes back, that
 * produces a new segment after the interruption, which is the intuitive
 * behavior.
 */
function buildSegments(transcription: ParaformerTranscription): DiarizedSegment[] {
  const segments: DiarizedSegment[] = [];
  const sentences = transcription.transcripts?.[0]?.sentences ?? [];
  for (const s of sentences) {
    const sid = s.speaker_id ?? 0;
    const text = (s.text ?? "").trim();
    if (!text) continue;
    const last = segments[segments.length - 1];
    if (last && last.speakerId === sid) {
      // Same speaker continuing — just append. Add a space only if the
      // preceding text doesn't already end with a punctuation mark that
      // visually separates sentences.
      const needSep = !/[。！？，,.!?]$/.test(last.text);
      last.text += (needSep ? " " : "") + text;
      last.endTime = s.end_time;
    } else {
      segments.push({
        speakerId: sid,
        text,
        beginTime: s.begin_time,
        endTime: s.end_time,
      });
    }
  }
  return segments;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    log.error("DASHSCOPE_API_KEY not set");
    return Response.json({ error: "DASHSCOPE_API_KEY not set" }, { status: 500 });
  }

  const url = new URL(req.url);
  const speakerCount = Math.max(
    2,
    Math.min(100, Number(url.searchParams.get("speakerCount") ?? "10") || 10)
  );

  let wav: Buffer;
  try {
    const arrayBuf = await req.arrayBuffer();
    wav = Buffer.from(arrayBuf);
  } catch (e) {
    log.error({ err: String(e) }, "failed to read request body");
    return Response.json({ error: "bad request body" }, { status: 400 });
  }

  if (wav.length < 1024) {
    return Response.json({ error: "audio too short (<1KB)" }, { status: 400 });
  }

  const filename = `meetflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  log.info({ bytes: wav.length, speakerCount, filename }, "diarize request received");

  try {
    const policy = await getUploadPolicy(apiKey);
    log.info({ upload_host: policy.upload_host, upload_dir: policy.upload_dir }, "got upload policy");

    const ossUrl = await uploadToOss(policy, wav, filename);
    log.info({ ossUrl }, "uploaded to temp oss");

    const taskId = await submitTask(apiKey, ossUrl, speakerCount);
    log.info({ taskId }, "task submitted");

    const output = await pollTask(apiKey, taskId);
    const transcriptionUrl = output.results?.[0]?.transcription_url;
    if (!transcriptionUrl) {
      throw new Error(`no transcription_url in task output: ${JSON.stringify(output)}`);
    }
    log.info({ taskId, transcriptionUrl }, "task succeeded, fetching result");

    const transcription = await fetchTranscription(transcriptionUrl);
    const segments = buildSegments(transcription);
    log.info({ taskId, segmentCount: segments.length }, "diarize complete");

    // Shape matches VoicePanel's TranscriptItem so the frontend can drop-in replace
    const transcripts = segments.map((s, i) => ({
      id: i + 1,
      speakerId: s.speakerId,
      speaker: `说话人 ${s.speakerId + 1}`,
      text: s.text,
      time: formatTimestamp(s.beginTime),
      beginTime: s.beginTime,
      endTime: s.endTime,
    }));

    return Response.json({ success: true, transcripts, taskId });
  } catch (err) {
    log.error({ err: String(err) }, "diarize failed");
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
