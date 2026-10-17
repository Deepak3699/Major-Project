FROM python:3.12-slim AS base
WORKDIR /app

FROM base AS builder
COPY requirements*.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

FROM base AS runner
COPY --from=builder /root/.local /root/.local
COPY . .
WORKDIR /app

# Real headless Chromium so the escalating fetch layer can render JS-heavy /
# anti-bot India portals (Apna flight data, LinkedIn/Indeed guest, WorkIndia,
# Hirist) and so the OSINT cascade can read public profiles. `--with-deps`
# installs the system libraries chromium needs on slim; `--only-shell` keeps the
# image smaller (headless shell is enough for scraping).
RUN python -m playwright install --with-deps chromium

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
