# CheckMate

셰어하우스 운영사와 예비 세입자를 연결하는 B2B2C 안심 매칭 인프라 MVP입니다.

입주 전 행동 기반 설문과 투명한 룰베이스 매칭을 제공하고, 매칭 이후에는 익명 30분 채팅·디지털 생활 협약·결제·30/90일 사후관리까지 연결합니다.

## 주요 기능

- 운영사·객실 유입 경로 추적: `operator_id`, `room_id`, funnel event
- 개인정보 보호형 인증 UI: 본인 인증·재직/학생 이메일 인증 Mock
- 행동 빈도 기반 생활 설문: 귀가, 수면, 청소, 소음, 방문객, 배달 등
- 설명 가능한 룰베이스 매칭: 항목별 가중치와 일치 이유 표시
- 1인 1매칭 채팅: Socket.IO + Redis adapter, 30분 TTL 세션
- 전자 생활 협약서 및 전자서명 Mock
- 안심 검증 수수료 결제 Mock
- 입주 후 민원 티켓, 30/90일 체크인, 피드백 라벨링
- 하우스 라운지: 생활비 1/N, 상태 공유, 청소 당번
- 운영사 KPI 대시보드 및 임베드 위젯

## 룰베이스 최적 매칭

매칭은 후보를 임의로 선택하지 않고 다음 순서로 계산합니다.

1. 세입자의 9개 행동 설문을 서버에 저장합니다.
2. 심야 귀가, 수면·기상, 청소, 소음, 배달 쓰레기, 방문객, 취사, 공용 공간 사용 항목별로 차이를 계산합니다.
3. 운영사 가중치를 적용해 0~100점 궁합도를 계산합니다.
4. 전체 후보를 점수순으로 정렬하고 가장 높은 후보를 `recommended`로 반환합니다.
5. 상위 일치 항목과 입주 전 조율이 필요한 항목을 함께 표시합니다.

기본 가중치는 심야 귀가 20, 수면 15, 기상 10, 청소 15, 소음 15, 배달 쓰레기 10, 방문객 10, 취사 3, 공용 공간 2입니다. 운영사는 `PUT /api/v1/operators/matching-rules/:key`로 가중치를 조정할 수 있습니다.

## 기술 스택

- Frontend: React, Vite, CSS
- Backend: Node.js, Express, Socket.IO
- Realtime/TTL: Redis, `@socket.io/redis-adapter`
- Database schema: PostgreSQL, Prisma 6
- Auth: JWT Mock, secure access/refresh token 라우터 샘플
- Deployment: Vercel frontend, Render backend, GitHub Actions

## 설치 및 실행

Windows에서는 아래 명령을 `cmd.exe`에서 실행하세요.

```cmd
npm install
copy .env.example .env
```

터미널을 두 개 열어 프론트엔드와 API 서버를 각각 실행합니다.

```cmd
:: 터미널 1
npm run server
```

```cmd
:: 터미널 2
npm run dev
```

접속 주소:

- Frontend: http://localhost:5173
- API: http://localhost:4000
- Health check: http://localhost:4000/health

## Demo 계정

모든 Demo 계정의 비밀번호는 `1234`입니다.

| ID | 역할 |
| --- | --- |
| `tenant1` | 세입자 1 |
| `tenant2` | 세입자 2 |
| `operatorA` | 운영사 대시보드 |

로그인 화면에서 세입자 버튼을 누르면 해당 ID와 비밀번호가 자동 입력됩니다.

## 테스트용 300명 시드 데이터

Mock API 서버가 시작될 때 테스트 세입자 약 300명과 9개 행동 설문 응답을 자동 생성합니다.

- 생성 데이터는 `server/store.js` 메모리에만 저장됩니다.
- 서버를 재시작하면 새로 생성되며 PostgreSQL에는 기록되지 않습니다.
- 매칭 후보 조회에 포함되지만 계정 ID는 UI에 노출하지 않습니다.
- 기본 생성 수는 `.env`의 `MOCK_TENANT_COUNT`로 조절할 수 있습니다. 최대 1,000명까지 지원합니다.

```env
MOCK_TENANT_COUNT=300
```

## 발표용 실행 모드

### 듀얼 채팅 모드

두 세입자 화면을 나란히 띄워 양쪽 계정으로 채팅을 시연합니다.

```text
http://localhost:5173/?demo=dual
```

### 하우스 라운지

생활비 정산, 상태 공유, 청소 당번 기능을 확인합니다.

```text
http://localhost:5173/?lounge=true
```

### 픽셀 라운지 직접 편집

라운지 바닥·벽·러그를 16px 격자에 칠하고, 가구와 캐릭터를 직접 이동할 수 있습니다.
`저장`은 현재 브라우저에 보관하며, JSON 내보내기/불러오기로 맵 파일을 백업할 수 있습니다.

```text
http://localhost:5173/?mapEditor=true
```

### 운영사 임베드 유입

운영사와 객실 정보를 URL 세션에 기록합니다.

```text
http://localhost:5173/?operator_id=operator-a&room_id=101
```

## Redis 설정

`.env`에서 Redis 주소를 설정합니다.

```env
REDIS_URL=redis://127.0.0.1:6379
```

Docker Desktop을 사용하는 경우:

```cmd
docker compose up -d redis
```

호스트의 6379 포트가 이미 사용 중이면 `docker-compose.yml`의 포트를 변경합니다.

```yaml
ports:
  - "6380:6379"
```

그 후 `.env`도 다음처럼 맞춥니다.

```env
REDIS_URL=redis://127.0.0.1:6380
```

Redis가 실행되지 않아도 서버는 Mock 채팅 저장소로 동작하지만, 실시간 멀티 인스턴스 채팅과 TTL 저장을 사용하려면 Redis가 필요합니다.

## Prisma / PostgreSQL

운영용 모델은 [prisma/schema.prisma](./prisma/schema.prisma)를 기준으로 합니다. 기존 [db/schema.sql](./db/schema.sql)은 초기 Mock/PostgreSQL 참고용으로 보존되어 있습니다.

주요 모델:

- `Operator`, `Tenant`, `Room`
- `Tenant` 기본 회원 정보: 선택적 `age`, `gender` enum(`FEMALE`, `MALE`, `NON_BINARY`, `PREFER_NOT_TO_SAY`)
- `Verification`, `Consent`, `BehaviorProfile(JSONB)`
- `Match`, `Payment`, `Contract`
- `CareLog`, `FeedbackLabel`
- `ChatSession`, `ChatMessage`
- `DigitalAgreement`, `MediationTicket`
- `Expense`, `ExpenseShare`, `Chore`

모든 핵심 모델은 UUID PK, `createdAt`, `updatedAt`, `deletedAt`를 사용합니다. 인증 원본 데이터는 저장하지 않고 인증 결과와 digest만 저장하도록 설계했습니다.

Prisma 명령은 `cmd.exe`에서 실행합니다.

Get-Process node | Stop-Process -Force
npx prisma generate --schema prisma/schema.prisma

```cmd
npx prisma format --schema prisma/schema.prisma
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
```

개발 DB에 반영:

```cmd
npx prisma db push --schema prisma/schema.prisma
```

운영 migration:

```cmd
npx prisma migrate dev --name init_checkmate
npx prisma migrate deploy
```

ERD는 [docs/checkmate-erd.md](./docs/checkmate-erd.md), 상세 실행 가이드는 [docs/prisma-setup.md](./docs/prisma-setup.md)에서 확인할 수 있습니다.

## 주요 API

### 인증

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/secure/login`
- `POST /api/v1/auth/secure/refresh`
- `POST /api/v1/auth/secure/logout`

### 매칭 및 채팅

- `GET /api/v1/matches/candidates`
- `POST /api/v1/matches/:id/chat-sessions`
- `POST /api/v1/matches/:id/chat-behavior` (메시지 원문 없이 채팅 행동 지표만 저장)
- Socket.IO room: `matchId`
- 채팅 세션 만료: 생성 후 30분

### 계약 및 사후관리

- `POST /api/v1/agreements`
- `POST /api/v1/agreements/:id/sign`
- `POST /api/v1/contracts`
- `POST /api/v1/feedback`
- `GET /api/v1/operators/:operatorId/feedback-insights`
- `POST /api/v1/mediation-tickets`
- `GET /api/v1/mediation-tickets/me`
- `PATCH /api/v1/mediation-tickets/:ticketId/status`
- `GET /api/v1/operators/:operatorId/dashboard`

### 퍼널 및 운영사

- `POST /api/v1/funnel/events`
- `GET /api/v1/operators/:operatorId/mediation-tickets`
- `GET /api/v1/operators/:operatorId/dashboard`

## 데이터 플라이휠과 안전망

- 입주 계약 시 30일·90일 체크인 스케줄을 만들고, 스케줄러가 만족도·갈등 카테고리를 요청합니다. 응답은 `BehaviorProfile`과 채팅 행동 지표를 함께 묶어 `FeedbackLabel` 학습 샘플과 `OutcomePatternAggregate` 통계로 누적합니다.
- 30분 익명 채팅은 메시지 원문을 TTL 이후 폐기하고, 선톡 여부·첫 응답 지연·평균 응답 지연·송수신량·활성 시간·적극성 점수만 저장합니다. 이 데이터는 개인 대화 내용을 복원하지 않는 모델 입력값입니다.
- 하우스 라운지의 SOS 중재 티켓은 접수→중재중→교체 검토→교체 승인 상태로 운영됩니다. 같은 방의 티켓이 3회 누적되면 `replacement_pending`과 재매칭 보증 검토 알림을 만들고, 운영사 대시보드 API에 노출합니다.

## 임베드 위젯

운영사 사이트에 다음과 같이 삽입할 수 있습니다.

```html
<div id="checkmate-widget"></div>
<script
  src="https://your-checkmate-host/checkmate-widget.js"
  data-operator-id="operator-a"
  data-room-id="101"
  data-mount="checkmate-widget">
</script>
```

로컬 예시는 [public/widget-example.html](./public/widget-example.html)입니다.

## Production 구조

- Vercel: Vite 프론트엔드
- Render: Express + Socket.IO API
- PostgreSQL: 운영 데이터베이스
- Redis: Socket.IO adapter, 분산 락, 채팅 TTL 저장
- GitHub Actions: `main` push 시 테스트·빌드·배포 트리거

관련 설정:

- [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)
- [render.yaml](./render.yaml)
- [vercel.json](./vercel.json)
- [.env.production.example](./.env.production.example)

Production 환경변수와 비밀키는 GitHub Secrets 또는 Vercel/Render Environment Variables에 저장합니다. JWT secret, DB URL, Redis URL, 결제·관측성 키를 저장소에 직접 커밋하지 마세요.

## 프로젝트 구조

```text
src/main.jsx              React 화면과 상태 관리
src/styles.css            모바일 우선 스타일
server/index.js           Express + Socket.IO API
server/matching.js        가중치 기반 매칭 엔진
server/store.js            Mock 데이터 저장소
server/auth.js             Access/Refresh 인증 샘플
server/concurrency.js      Redis 분산 락
server/transactions.js     PostgreSQL 트랜잭션 샘플
prisma/schema.prisma       운영용 PostgreSQL Prisma 스키마
docs/checkmate-erd.md      Mermaid ERD
public/checkmate-widget.js 운영사 임베드 위젯
```

## 검증 명령

```cmd
npm run db:validate
npm run build
```

현재 외부 본인인증, PG 결제, PostgreSQL repository는 Mock/API 계약 형태입니다. 실제 출시 전에는 외부 연동 자격증명, 개인정보 보유기간, 접근권한, 결제 환불 정책, 로그 마스킹을 별도로 검토해야 합니다.
# CheckMate MVP 진행 현황

현재 로컬 MVP는 PostgreSQL·Prisma·Redis 기반으로 구성되어 있습니다.

## 구현된 기능

- PostgreSQL 계정/사용자 프로필 및 행동 설문 저장
- Prisma 기반 매칭·결제·채팅 세션 저장
- 양쪽 사용자 채팅 요청 및 상호 수락 흐름
- Redis/Socket.IO 실시간 30분 익명 채팅
- 양쪽 결제 완료 전 입주 라운지 접근 제한
- 30일 안심 케어 화면과 룸메이트 상태 표시
- 채팅 센터(받은 요청/활성 채팅방)
- 마이페이지 사용자 정보 수정
- 듀얼 채팅 데모(`?demo=dual`)
- Prisma Repository 및 CareCheckin 스케줄러 기반

## 로컬 실행

```powershell
docker compose up -d postgres redis
npm install
npx prisma db push --schema prisma/schema.prisma
$env:SEED_PASSWORD="1234"
npm run db:seed
npm run server
```

별도 터미널에서 프론트를 실행합니다.

```powershell
npm run dev
```

기본 계정은 `tenant1`, `tenant2`, `operator1`이며 로컬 시드 시 지정한 `SEED_PASSWORD`를 사용합니다.

주의: `.env`는 커밋하지 말고 배포 환경의 환경 변수로 관리하세요. 운영 전 `MOCK_MODE=false`, 강한 JWT/DB 비밀번호, 결제·인증 공급자 설정을 점검해야 합니다.
