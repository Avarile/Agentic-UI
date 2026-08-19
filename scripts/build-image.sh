TAG="release.$(date -u +%Y-%m-%dT%H-%M-%SZ).1"

  docker build -f Dockerfile.multi -t "agentic-ui-api:$TAG" \
    --build-arg BUILD_COMMIT="$(git rev-parse --short HEAD)" \
    --build-arg BUILD_BRANCH="$(git rev-parse --abbrev-ref HEAD)" \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --progress=plain .