# Cloud Log Monitoring

Monitor cloud service logs through TracePulse using `run_and_watch` with your cloud provider's CLI. Zero additional dependencies - just your existing CLI tools.

## AWS CloudWatch

```
# Tail Lambda function logs
run_and_watch("aws logs tail /aws/lambda/my-function --follow --since 5m", timeout_seconds: 60)

# Tail ECS service logs
run_and_watch("aws logs tail /ecs/my-service --follow --since 5m", timeout_seconds: 60)

# Tail API Gateway logs
run_and_watch("aws logs tail API-Gateway-Execution-Logs_abc123/prod --follow", timeout_seconds: 60)

# Or attach to a log stream
tracepulse attach --log-file <(aws logs tail /aws/lambda/my-function --follow)
```

Requires: [`aws` CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) installed and configured (`aws configure`).

## Google Cloud (GCP)

```
# Tail Cloud Run logs
run_and_watch("gcloud logging tail 'resource.type=cloud_run_revision AND resource.labels.service_name=my-service' --format='value(textPayload)'", timeout_seconds: 60)

# Tail Cloud Functions logs
run_and_watch("gcloud functions logs read my-function --limit=50", timeout_seconds: 30)

# Tail GKE pod logs
run_and_watch("kubectl logs -f deployment/my-app --tail=100", timeout_seconds: 60)

# Tail App Engine logs
run_and_watch("gcloud app logs tail", timeout_seconds: 60)
```

Requires: [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth login`).

## Microsoft Azure

```
# Tail Azure Functions logs
run_and_watch("az webapp log tail --name my-app --resource-group my-rg", timeout_seconds: 60)

# Tail Container Apps logs
run_and_watch("az containerapp logs show --name my-app --resource-group my-rg --follow", timeout_seconds: 60)

# Tail AKS pod logs
run_and_watch("kubectl logs -f deployment/my-app --tail=100", timeout_seconds: 60)
```

Requires: [`az` CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and authenticated (`az login`).

## Kubernetes (any provider)

```
# Tail pod logs
run_and_watch("kubectl logs -f deployment/my-app --tail=100", timeout_seconds: 60)

# Tail with label selector
run_and_watch("kubectl logs -f -l app=my-service --all-containers --tail=50", timeout_seconds: 60)

# Tail specific container in a pod
run_and_watch("kubectl logs -f my-pod -c my-container", timeout_seconds: 60)
```

Requires: [`kubectl`](https://kubernetes.io/docs/tasks/tools/) configured with cluster access.

## Docker (local or remote)

```
# Tail container logs
run_and_watch("docker logs -f my-container --tail 100", timeout_seconds: 60)

# Docker Compose service
run_and_watch("docker compose logs -f api --tail 100", timeout_seconds: 60)

# Or use TracePulse's built-in compose mode
tracepulse compose --file docker-compose.yml
```

## Heroku

```
# Tail app logs
run_and_watch("heroku logs --tail --app my-app", timeout_seconds: 60)

# Tail specific dyno
run_and_watch("heroku logs --tail --dyno web.1 --app my-app", timeout_seconds: 60)
```

Requires: [`heroku` CLI](https://devcenter.heroku.com/articles/heroku-cli) installed and authenticated.

## Vercel

```
# Tail function logs
run_and_watch("vercel logs my-project --follow", timeout_seconds: 60)
```

Requires: [`vercel` CLI](https://vercel.com/docs/cli) installed and authenticated.

## Railway

```
# Tail service logs
run_and_watch("railway logs --follow", timeout_seconds: 60)
```

Requires: [`railway` CLI](https://docs.railway.com/guides/cli) installed and linked to project.

## Fly.io

```
# Tail app logs
run_and_watch("fly logs --app my-app", timeout_seconds: 60)
```

Requires: [`fly` CLI](https://fly.io/docs/flyctl/install/) installed and authenticated.

## How It Works

All cloud CLIs stream logs to stdout. TracePulse's `run_and_watch` captures that stdout and pipes it through the full parser pipeline:

1. Cloud CLI streams log lines to stdout
2. TracePulse parses with 20 parsers (Python tracebacks, Node.js errors, JSON logs, etc.)
3. Errors are scored, deduplicated, and stored
4. Agent gets structured results: file:line, error type, signal score

The same parsers that catch local dev server errors catch cloud errors too. A Python traceback from Lambda looks the same as one from your local server.

## Limitations

- `run_and_watch` has a timeout (default 60s) - for continuous monitoring, use attach mode with a log file
- Cloud CLI must be installed and authenticated on the machine running TracePulse
- Some cloud CLIs have rate limits on log tailing
- `run_and_watch` command allowlist includes `bash` - use `bash -c "aws logs tail ..."` if the direct command isn't in the allowlist
