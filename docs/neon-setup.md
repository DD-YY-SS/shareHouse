# Neon DB 연결 가이드

이 프로젝트의 백엔드는 Prisma의 `DATABASE_URL`을 통해 PostgreSQL에 연결됩니다. Neon에서 발급한 연결 문자열에는 반드시 `sslmode=require`를 포함하세요.

## 1. Neon 프로젝트 만들기

1. Neon 콘솔에서 프로젝트를 생성합니다.
2. 데이터베이스 이름은 `checkmate`로 만들거나, 원하는 이름을 사용합니다.
3. **Connect** 화면에서 PostgreSQL 연결 문자열을 복사합니다.
4. 연결 문자열은 GitHub, Vercel, 채팅에 공개하지 않습니다.

예시 형식:

```text
postgresql://사용자:비밀번호@ep-xxxx.ap-southeast-1.aws.neon.tech/checkmate?sslmode=require
```

## 2. 로컬 백엔드를 Neon에 연결하기

`.env`의 `DATABASE_URL`만 Neon 연결 문자열로 교체합니다.

```env
NODE_ENV=development
MOCK_MODE=false
PERSISTENCE_READY=false
DATABASE_URL=postgresql://사용자:비밀번호@ep-xxxx.ap-southeast-1.aws.neon.tech/checkmate?sslmode=require
```

그 다음 **cmd.exe**에서 실행합니다. PowerShell에서는 `npx` 명령을 실행하지 않습니다.

```cmd
npx prisma generate --schema prisma\schema.prisma
npx prisma db push --schema prisma\schema.prisma
set SEED_PASSWORD=1234&&npm run db:seed
npm run server
```

정상 연결되면 다음 주소가 `{"status":"ok"}`를 반환합니다.

```text
http://localhost:4000/health
```

## 3. 운영 환경 변수

Node.js 백엔드를 호스팅하는 서비스의 환경변수에 아래 값을 등록합니다.

```env
NODE_ENV=production
MOCK_MODE=false
PERSISTENCE_READY=true
CLIENT_ORIGIN=https://building-sooty.vercel.app
DATABASE_URL=Neon_연결문자열
JWT_SECRET=32자 이상의 별도 비밀키
REFRESH_TOKEN_SECRET=32자 이상의 별도 비밀키
VERIFICATION_PEPPER=32자 이상의 별도 비밀키
REDIS_URL=운영용 Redis 연결문자열
```

백엔드가 배포된 뒤 Vercel의 `VITE_API_URL`을 백엔드의 실제 HTTPS 주소로 변경하고 프론트를 다시 배포합니다. 현재 Render 서비스가 없다면 `https://checkmate-api.onrender.com`을 사용하면 안 됩니다.

## 4. 확인 순서

1. Neon 연결 문자열로 로컬 `db push` 실행
2. `db:seed`로 테스트 계정 생성
3. 로컬 `/health` 확인
4. 백엔드 호스팅 서비스의 `/health` 확인
5. Vercel `VITE_API_URL`을 백엔드 주소로 변경
6. 로그인 → 설문 → 매칭 → 채팅 순서로 확인

Neon Free 플랜은 MVP 테스트에 적합하지만, 자동 백업·고가용성·트래픽 증가에 대한 운영 정책은 출시 전에 별도로 점검해야 합니다.
