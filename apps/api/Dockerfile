# 1. Python 3.12가 설치된 기본 이미지 사용
FROM python:3.12-slim

# 2. uv 패키지 관리자 설치
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 3. 컨테이너 내부 작업 폴더 설정
WORKDIR /app

# 4. Python 패키지 관리 파일 복사
COPY pyproject.toml uv.lock ./

# 5. 필요한 패키지 설치 (개발 도구 제외)
RUN uv sync --locked --no-dev

# 6. FastAPI 소스 코드 복사
COPY aura_api ./aura_api
COPY aura_api ./aura_api
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations
COPY db ./db

# 7. 가상환경의 실행 프로그램 사용
ENV PATH="/app/.venv/bin:$PATH"

# 8. FastAPI가 사용할 포트 표시
EXPOSE 8000

# 9. FastAPI 서버 실행
CMD ["uvicorn", "aura_api.main:app", "--host", "0.0.0.0", "--port", "8000"]