# Cloud Log Monitoring

Monitor logs from AWS, GCP, Azure, Kubernetes, Docker, Heroku, Vercel, Railway, and Fly.io through TracePulse. Zero additional dependencies - uses your existing cloud CLI tools.

## How It Works

All cloud CLIs stream logs to stdout. TracePulse's [`run_and_watch`](../features/mcp-tools.md#run_and_watch) captures that output and pipes it through the full parser pipeline. A Python traceback from AWS Lambda is parsed the same way as one from your local server.

## Supported Platforms

| Platform | CLI | Example |
|----------|-----|---------|
| **AWS CloudWatch** | `aws` | `run_and_watch("aws logs tail /aws/lambda/my-fn --follow")` |
| **Google Cloud** | `gcloud` | `run_and_watch("gcloud logging tail 'resource.type=cloud_run_revision'")` |
| **Azure** | `az` | `run_and_watch("az webapp log tail --name my-app")` |
| **Kubernetes** | `kubectl` | `run_and_watch("kubectl logs -f deployment/my-app")` |
| **Docker** | `docker` | `run_and_watch("docker logs -f my-container")` |
| **Heroku** | `heroku` | `run_and_watch("heroku logs --tail --app my-app")` |
| **Vercel** | `vercel` | `run_and_watch("vercel logs my-project --follow")` |
| **Railway** | `railway` | `run_and_watch("railway logs --follow")` |
| **Fly.io** | `fly` | `run_and_watch("fly logs --app my-app")` |

## Requirements

- The cloud CLI must be installed and authenticated on your machine ([install links](https://chaoslabz.gitbook.io/tracepulse/getting-started/quick-start#prerequisites))
- TracePulse parses the output with the same 25 parsers used for local dev servers
- A Python traceback from AWS Lambda is parsed the same way as one from your local server

