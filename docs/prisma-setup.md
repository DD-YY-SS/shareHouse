# Prisma 스키마 운영 가이드

운영용 PostgreSQL 데이터 모델은 `prisma/schema.prisma`를 기준으로 합니다.

## Windows CMD 명령어

아래 명령은 PowerShell이 아닌 `cmd.exe`에서 실행하세요.

```cmd
npm install
npx prisma format --schema prisma/schema.prisma
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
```

개발용 DB에 스키마를 반영하려면 `.env`의 `DATABASE_URL`을 설정한 뒤 실행합니다.

```cmd
npx prisma db push --schema prisma/schema.prisma
```

운영 환경에서는 `db push` 대신 migration을 사용합니다.

```cmd
npx prisma migrate dev --name init_checkmate
npx prisma migrate deploy
```

## 모델링 원칙

- `Tenant`와 `Operator`는 별도 모델이며 모든 PK는 UUID입니다.
- `Room -> Match -> Contract -> Payment`로 B2B2C 업무 흐름을 추적합니다.
- `Verification`에는 원본 신원자료를 저장하지 않고 성공 여부, 기관, 만료일, 결과 digest만 저장합니다.
- 행동 설문과 매칭 설명값은 PostgreSQL `JSONB`로 저장합니다.
- 모든 모델에 `createdAt`, `updatedAt`, `deletedAt`를 두고, 외래키·상태·운영사 대시보드 조회 조합에 인덱스를 둡니다.
- `CareLog`와 `FeedbackLabel`은 30/90일 체크인과 룰베이스 가중치 보정용 데이터 플라이휠을 담당합니다.

전체 관계도는 [checkmate-erd.md](./checkmate-erd.md)에서 확인할 수 있습니다.
