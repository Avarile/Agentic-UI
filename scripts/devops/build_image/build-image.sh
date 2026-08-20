TAG="release.$(date -u +%Y-%m-%dT%H-%M-%SZ).1"

  docker build -f Dockerfile.multi -t "cybernetics-agentic-ui-api:$TAG" \
    --build-arg BUILD_COMMIT="$(git rev-parse --short HEAD)" \
    --build-arg BUILD_BRANCH="$(git rev-parse --abbrev-ref HEAD)" \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --progress=plain .


## Deploy to K3s-server
```extract image
 docker save cybernetics-agentic-ui-api:release.2026-08-20T11-19-12Z.1 \
   | ssh K3s-server 'cat > ~/agentic-ui-api-release.2026-08-20T11-19-12Z.1.tar'
```

```import to K3s-server
ssh -t K3s-server 'sudo k3s ctr -n k8s.io images import ~/agentic-ui-api-release.2026-08-20T11-19-12Z.1.tar'
```