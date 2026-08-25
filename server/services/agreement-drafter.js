import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import crypto from 'node:crypto';
import { z } from 'zod';

export const agreementDraftSchema = z.object({
  title: z.string().min(1).max(120),
  rules: z.array(z.object({
    category: z.enum(['quiet_hours', 'cleaning', 'guests', 'shared_space', 'communication', 'other']),
    content: z.string().min(1).max(240),
    agreedBy: z.array(z.enum(['tenantA', 'tenantB'])).max(2),
    needsConfirmation: z.boolean(),
  })).max(10),
  unresolvedItems: z.array(z.string().min(1).max(180)).max(10),
});

// API 장애나 무료 할당량 초과가 발생해도 사용자가 빈 화면을 보지 않도록 하는 안전한 초안입니다.
const fallbackDraft = {
  title: '우리의 생활 협약서 초안',
  rules: [
    { category: 'quiet_hours', content: '밤 23시 이후에는 공용 공간의 소음을 줄여요.', agreedBy: [], needsConfirmation: true },
    { category: 'cleaning', content: '공용 공간은 주 1회 이상 함께 정리해요.', agreedBy: [], needsConfirmation: true },
    { category: 'guests', content: '방문객이 있을 때는 미리 서로에게 알려요.', agreedBy: [], needsConfirmation: true },
  ],
  unresolvedItems: ['초안을 확인한 뒤 양측이 최종 동의해야 해요.'],
};

const numberEnv = (name, fallback, min, max) => {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
};

// Gemini에 30개의 요청을 동시에 보내지 않고, 한 프로세스에서 안정적으로 처리합니다.
// 여러 인스턴스를 운영할 때는 Render의 인스턴스 수를 먼저 확인하고 이 값을 조정하세요.
const agreementConfig = () => ({
  maxConcurrency: numberEnv('AGREEMENT_MAX_CONCURRENCY', 4, 1, 16),
  maxQueue: numberEnv('AGREEMENT_QUEUE_MAX', 60, 1, 500),
  queueWaitTimeoutMs: numberEnv('AGREEMENT_QUEUE_WAIT_TIMEOUT_MS', 180000, 1000, 600000),
  providerTimeoutMs: numberEnv('AGREEMENT_PROVIDER_TIMEOUT_MS', 20000, 3000, 120000),
  retryCount: numberEnv('AGREEMENT_RETRY_COUNT', 2, 0, 4),
  providerRpm: numberEnv('AGREEMENT_PROVIDER_RPM', 15, 1, 120),
  // Keep the pre-queue default so long conversations do not produce truncated JSON.
  maxOutputTokens: numberEnv('AGREEMENT_MAX_OUTPUT_TOKENS', 6000, 1000, 6000),
  cacheTtlMs: numberEnv('AGREEMENT_CACHE_TTL_SECONDS', 1800, 0, 86400) * 1000,
});
const maxCacheEntries = 500;

let activeJobs = 0;
const pendingJobs = [];
const inFlightJobs = new Map();
const draftCache = new Map();
const providerStartTimes = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForProviderSlot() {
  while (true) {
    const { providerRpm } = agreementConfig();
    const now = Date.now();
    while (providerStartTimes[0] && providerStartTimes[0] <= now - 60000) providerStartTimes.shift();
    if (providerStartTimes.length < providerRpm) {
      providerStartTimes.push(now);
      return;
    }
    await sleep(Math.max(250, providerStartTimes[0] + 60000 - now));
  }
}

function queueError(message, code = 'AGREEMENT_QUEUE_BUSY', statusCode = 503) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function pumpQueue() {
  while (activeJobs < agreementConfig().maxConcurrency && pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    if (job.cancelled) continue;

    activeJobs += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeJobs -= 1;
        if (job.key && inFlightJobs.get(job.key) === job.promise) inFlightJobs.delete(job.key);
        pumpQueue();
      });
  }
}

function enqueueAgreementTask(key, task) {
  const existing = inFlightJobs.get(key);
  if (existing) return existing;
  const { maxQueue, queueWaitTimeoutMs } = agreementConfig();
  if (pendingJobs.length >= maxQueue) {
    return Promise.reject(queueError('협약서 생성 요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.'));
  }

  let timeoutId;
  let job;
  const promise = new Promise((resolve, reject) => {
    job = { key, task, resolve, reject, cancelled: false };
    timeoutId = setTimeout(() => {
      if (!job.cancelled) {
        job.cancelled = true;
        reject(queueError('협약서 생성 대기 시간이 초과됐어요. 다시 시도해 주세요.', 'AGREEMENT_QUEUE_TIMEOUT', 504));
      }
    }, queueWaitTimeoutMs);
    pendingJobs.push(job);
    pumpQueue();
  }).finally(() => clearTimeout(timeoutId));

  // Promise를 job에 연결해 같은 매칭의 동시 요청을 하나로 합칩니다.
  job.promise = promise;
  inFlightJobs.set(key, promise);
  return promise;
}

function cleanMessage(value) {
  return String(value || '')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[외부 링크 제거]')
    .replace(/\b(?:010|011|016|017|018|019)[- .]?\d{3,4}[- .]?\d{4}\b/g, '[연락처 제거]')
    .slice(0, 500);
}

function transcriptFor(messages, tenantAId, tenantBId) {
  return messages
    .filter((message) => message && typeof message === 'object')
    .slice(-80)
    .map((message) => {
      const sender = message.from === tenantBId ? 'tenantB' : message.from === tenantAId ? 'tenantA' : 'unknown';
      const text = cleanMessage(message.text || message.body);
      return `${sender}: ${text}`;
    })
    .filter((line) => !line.endsWith(': '))
    .join('\n');
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pruneCache() {
  const now = Date.now();
  for (const [key, item] of draftCache) if (item.expiresAt <= now) draftCache.delete(key);
  while (draftCache.size > maxCacheEntries) draftCache.delete(draftCache.keys().next().value);
}

function retryable(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  return [408, 409, 429].includes(status) || status >= 500 || ['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED'].includes(error?.code);
}

async function withRetry(task) {
  const { retryCount } = agreementConfig();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!retryable(error) || attempt >= retryCount) throw error;
      const retryAfter = Number(error?.headers?.['retry-after']) || 0;
      const backoff = retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : Math.min(1000 * (2 ** attempt), 8000);
      await sleep(backoff + Math.floor(Math.random() * 250));
    }
  }
}

function parseJsonContent(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part?.text || '').join('')
    : String(content || '');
  const withoutFence = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(withoutFence);
}

function promptFor(transcript) {
  return [
    '당신은 셰어하우스 생활 협약서 초안 작성 도우미입니다.',
    '대화에서 양측이 명시적으로 동의한 생활 규칙만 추출하세요.',
    '한 사람의 제안, 추측, 감정 표현은 합의로 표시하지 마세요.',
    '합의 여부가 불명확하면 agreedBy를 빈 배열로 두고 needsConfirmation을 true로 설정하세요.',
    '전화번호, 이메일, 외부 링크 등 개인정보는 결과에 포함하지 마세요.',
    '법률 자문이나 법적 효력을 주장하지 말고, 반드시 양측 최종 확인이 필요한 초안으로 작성하세요.',
    '반드시 다음 JSON 구조만 반환하세요: {"title":string,"rules":[{"category":"quiet_hours|cleaning|guests|shared_space|communication|other","content":string,"agreedBy":["tenantA" 또는 "tenantB"],"needsConfirmation":boolean}],"unresolvedItems":string[]}',
    '',
    `익명 대화:\n${transcript}`,
  ].join('\n');
}

async function callProvider({ provider, apiKey, baseURL, model, transcript }) {
  const client = new OpenAI({ apiKey, baseURL, timeout: agreementConfig().providerTimeoutMs, maxRetries: 0 });
  const userPrompt = promptFor(transcript);

  if (provider === 'gemini') {
    // Prefer the structured-output path that worked before the agreement queue
    // was introduced. Gemini can truncate free-form JSON on longer transcripts.
    try {
      const completion = await client.beta.chat.completions.parse({
        model,
        max_tokens: agreementConfig().maxOutputTokens,
        reasoning_effort: 'none',
        messages: [
          {
            role: 'system',
            content: [
              '당신은 셰어하우스 생활 협약서 초안 작성 도우미입니다.',
              '대화에서 양측이 명시적으로 합의한 생활 규칙만 추출하세요.',
              '한 사람의 제안, 추측, 감정 표현은 합의로 표시하지 마세요.',
              '합의 여부가 불명확하면 agreedBy를 빈 배열로 두고 needsConfirmation을 true로 설정하세요.',
              '전화번호, 이메일, 외부 링크 등 개인정보는 결과에 포함하지 마세요.',
              '법률 자문이나 법적 효력을 주장하지 말고, 반드시 양측 최종 확인이 필요한 초안으로 작성하세요.',
            ].join('\n'),
          },
          { role: 'user', content: `다음 익명 대화를 협약서 초안 JSON으로 변환하세요.\n\n${transcript}` },
        ],
        response_format: zodResponseFormat(agreementDraftSchema, 'LivingAgreementDraft'),
      });
      const parsed = completion.choices?.[0]?.message?.parsed;
      return agreementDraftSchema.parse(parsed);
    } catch (structuredError) {
      // Some Gemini-compatible accounts reject JSON schema. Retry once with
      // the compatible JSON-object format before using the local fallback.
      console.warn('agreement_gemini_structured_failed', structuredError?.message || structuredError);
      const completion = await client.chat.completions.create({
        model,
        max_tokens: agreementConfig().maxOutputTokens,
        temperature: 0.1,
        messages: [{ role: 'system', content: userPrompt }],
        response_format: { type: 'json_object' },
      });
      const raw = completion.choices?.[0]?.message?.content;
      return agreementDraftSchema.parse(parseJsonContent(raw));
    }
  }

  const instructor = Instructor({ client, mode: 'TOOLS' });
  const draft = await instructor.chat.completions.create({
    model,
    max_tokens: agreementConfig().maxOutputTokens,
    max_retries: 0,
    messages: [{ role: 'system', content: userPrompt }],
    response_model: { schema: agreementDraftSchema, name: 'LivingAgreementDraft' },
  });
  return agreementDraftSchema.parse(draft);
}

// If the provider is temporarily unavailable, keep the user's conversation
// useful instead of returning the same generic three-rule placeholder every
// time. This is deliberately conservative: it only emits categories whose
// keywords appear in the transcript and always marks them for final review.
export function fallbackDraftFromTranscript(transcript) {
  const text = String(transcript || '');
  const rules = [];
  const add = (category, content) => rules.push({ category, content, agreedBy: [], needsConfirmation: true });
  if (/(소음|조용|이어폰|통화|영상|23시|밤 11시|자정)/.test(text)) {
    add('quiet_hours', '밤 23시 이후에는 공용 공간의 소음을 줄이고, 통화·영상 시청 시 이어폰을 사용해요.');
  }
  if (/(청소|정리|설거지|주방|화장실)/.test(text)) {
    add('cleaning', '공용 공간은 정해진 주기에 맞춰 함께 정리하고, 사용한 식기와 조리도구는 바로 정리해요.');
  }
  if (/(방문객|손님|친구|연인|알려|하루 전)/.test(text)) {
    add('guests', '방문객이 있을 때는 미리 서로에게 알리고, 머무는 시간은 함께 정해요.');
  }
  if (/(냉장고|수납|공용 공간|각자 구역|공동 사용)/.test(text)) {
    add('shared_space', '공용 냉장고와 수납공간은 서로 정한 구역과 사용 규칙을 지켜요.');
  }
  if (/(동의|좋아요|합의|정하|그렇게 하|알겠습니다)/.test(text)) {
    for (const rule of rules) rule.needsConfirmation = true;
  }
  return {
    title: '우리의 생활 협약서 초안',
    rules: rules.length ? rules.slice(0, 10) : fallbackDraft.rules,
    unresolvedItems: ['AI 초안과 대화 내용을 양측이 직접 확인한 뒤 최종 동의해 주세요.'],
  };
}

export async function draftAgreementFromMessages({ messages, tenantAId, tenantBId, cacheKey = '' }) {
  const transcript = transcriptFor(messages, tenantAId, tenantBId);
  if (!transcript) return { draft: fallbackDraft, source: 'fallback' };

  const provider = String(process.env.AGREEMENT_PROVIDER || 'openai').toLowerCase();
  const apiKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) return { draft: fallbackDraft, source: 'mock_no_api_key', provider };

  const requestKey = `${cacheKey || `${tenantAId}:${tenantBId}`}:${digest(transcript)}`;
  pruneCache();
  const cached = draftCache.get(requestKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const baseURL = provider === 'gemini'
    ? (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/')
    : process.env.OPENAI_BASE_URL;
  const model = process.env.AGREEMENT_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');

  const value = await enqueueAgreementTask(requestKey, async () => {
    const draft = await withRetry(async () => {
      await waitForProviderSlot();
      return callProvider({ provider, apiKey, baseURL, model, transcript });
    });
    return { draft, source: 'llm', provider };
  });

  const { cacheTtlMs } = agreementConfig();
  if (cacheTtlMs > 0) draftCache.set(requestKey, { value, expiresAt: Date.now() + cacheTtlMs });
  return value;
}

export function getAgreementQueueStats() {
  const { maxConcurrency, maxQueue, providerRpm } = agreementConfig();
  const { maxOutputTokens } = agreementConfig();
  return { active: activeJobs, queued: pendingJobs.length, inFlight: inFlightJobs.size, maxConcurrency, maxQueue, providerRpm, maxOutputTokens };
}

export { fallbackDraft };
