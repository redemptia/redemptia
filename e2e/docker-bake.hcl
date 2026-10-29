# The images e2e/.redemptia/redemptia.yaml would build, under the names the compose
# files give them. CI builds from this instead of `docker compose build` so the
# build can start before `redemptia init` has generated that compose file.

group "default" {
  targets = ["web", "migrate", "worker"]
}

target "_redemptia" {
  context    = "."
  dockerfile = "docker/Dockerfile"
}

target "web" {
  inherits = ["_redemptia"]
  target   = "web"
  tags     = ["redemptia-e2e-web"]
}

target "migrate" {
  inherits = ["_redemptia"]
  target   = "migrate"
  tags     = ["redemptia-e2e-migrate"]
}

target "worker" {
  inherits = ["_redemptia"]
  target   = "worker"
  tags     = ["redemptia-e2e-worker"]
}
