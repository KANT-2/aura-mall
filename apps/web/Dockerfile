# 1. Node.js 22 실행 환경
FROM node:22-bookworm-slim

# 2. 컨테이너 내부 작업 폴더
WORKDIR /app

# 3. npm workspace 관련 설정 파일 복사
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json

# 4. 프로젝트 의존성 설치
RUN npm ci

# 5. 프론트엔드 소스 및 설정 복사
COPY apps/web ./apps/web

# 6. Next.js 배포용 빌드
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 7. 실행 환경
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# 8. Next.js 포트
EXPOSE 3000

# 9. Next.js 실행
CMD ["npm", "run", "start"]