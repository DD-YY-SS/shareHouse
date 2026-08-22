// 채팅 본문에 연락처·외부 링크가 포함되지 않도록 처리합니다.
// 실제 원문은 저장하지 않고, 마스킹된 결과만 Redis/소켓으로 전달합니다.
const contactPatterns = [
  /https?:\/\/[^\s]+/gi,
  /(?:^|\s)010[-\s.]?\d{4}[-\s.]?\d{4}(?=\s|$)/gi,
  /(?:^|\s)\d{2,3}[-\s.]?\d{3,4}[-\s.]?\d{4}(?=\s|$)/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /(?:kakaotalk|kakao|instagram)\s*:?\s*[A-Z0-9._-]{2,}/gi,
];

export function maskContactInfo(value = '') {
  let text = value;
  let detected = false;

  for (const pattern of contactPatterns) {
    text = text.replace(pattern, () => {
      detected = true;
      return '***';
    });
  }

  return { text, detected };
}
