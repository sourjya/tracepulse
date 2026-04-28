# CLI Commands

```bash
tracepulse start <command>                    # Spawn and monitor
tracepulse start --service api="cmd"          # Multi-process
tracepulse start --config config.json         # Config file
tracepulse start --persist "cmd"              # With fingerprint persistence
tracepulse start --http "cmd"                 # With HTTP transport
tracepulse start --health-url http://localhost:8000/health "cmd"

tracepulse attach --log-file ./server.log     # Tail single file
tracepulse attach --log-file a=./a.log --log-file b=./b.log  # Multi-file

tracepulse compose --file docker-compose.yml  # Docker Compose

tracepulse --version                          # Print version
tracepulse --help                             # Print help
```
