# EUNOCURA API — DigitalOcean App Platform / any container host.
#
# Build context is `backend/`. The image serves the JSON API only; the React app
# is deployed as a static site (see .do/app.yaml) and talks to this service over
# VITE_API_BASE_URL.
#
# No model weights are baked in. With LLM_PROVIDER=gemini the model is reached
# over the network; with LLM_PROVIDER=ollama point OLLAMA_BASE_URL at a reachable
# Ollama server; with LLM_PROVIDER=none every deterministic path still works.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Only the demo-path requirements: no torch, no faiss, no sentence-transformers.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Writable dirs that the app creates lazily anyway; doing it here keeps the
# container runnable as a non-root user if you add one.
RUN mkdir -p data/uploads .cache/llm

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=4).status==200 else 1)"

CMD ["sh", "-c", "uvicorn src.server:app --host 0.0.0.0 --port ${PORT:-8000}"]
