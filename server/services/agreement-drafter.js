import Instructor from '@instructor-ai/instructor';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
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

const fallbackDraft = {
  title: '우리의 생활 협약서 초안',
  rules: [
    { category: 'quiet_hours', content: '밤 23시 이후에는 공용 공간의 소음을 줄여요.', agreedBy: [], needsConfirmation: true },
    { category: 'cleaning', content: '공용 공간은 주 1회 이상 함께 정리해요.', agreedBy: [], needsConfirmation: true },
    { category: 'guests', content: '방문객이 있을 때는 미리 서로에게 알려요.', agreedBy: [], needsConfirmation: true },
  ],
  unresolvedItems: ['양측이 초안을 확인하고 최종 동의해야 합니다.'],
};

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

export async function draftAgreementFromMessages({ messages, tenantAId, tenantBId }) {
  const transcript = transcriptFor(messages, tenantAId, tenantBId);
  if (!transcript) return { draft: fallbackDraft, source: 'fallback' };

  const provider = String(process.env.AGREEMENT_PROVIDER || 'openai').toLowerCase();
  const apiKey = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) return { draft: fallbackDraft, source: 'mock_no_api_key', provider };
  const baseURL = provider === 'gemini'
    ? (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/')
    : process.env.OPENAI_BASE_URL;
  const client = new OpenAI({ apiKey, baseURL, timeout: 30000, maxRetries: 0 });
  const model = process.env.AGREEMENT_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');

  // Gemini's OpenAI-compatible structured-output endpoint expects the
  // json_schema response format used by zodResponseFormat. Instructor's
  // JSON_SCHEMA adapter sends a different json_object shape, which Gemini
  // rejects with HTTP 400.
  if (provider === 'gemini') {
    const completion = await client.beta.chat.completions.parse({
      model,
      max_tokens: 6000,
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
    return { draft: agreementDraftSchema.parse(parsed), source: 'llm', provider };
  }

  const instructor = Instructor({
    client,
    mode: 'TOOLS',
  });

  const draft = await instructor.chat.completions.create({
    model,
    max_tokens: 2400,
    max_retries: 1,
    ...(provider === 'gemini' ? { reasoning_effort: 'none' } : {}),
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
    response_model: { schema: agreementDraftSchema, name: 'LivingAgreementDraft' },
  });

  return { draft: agreementDraftSchema.parse(draft), source: 'llm', provider };
}

export { fallbackDraft };
