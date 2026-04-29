/**
 * Config file scanner for infrastructure service discovery.
 *
 * Parses .env files to extract service URLs (database, Redis, etc.)
 * and maps them to named services with host/port.
 */

import { existsSync, readFileSync } from "node:fs";

/** A discovered infrastructure service. */
export interface DiscoveredService {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly protocol: string;
  readonly source: string;
}

/** Protocol/port to human-readable service name. */
const SERVICE_NAMES: Record<string, string> = {
  postgresql: "PostgreSQL", postgres: "PostgreSQL",
  mysql: "MySQL", mariadb: "MariaDB",
  redis: "Redis", rediss: "Redis",
  amqp: "RabbitMQ", amqps: "RabbitMQ",
  mongodb: "MongoDB", "mongodb+srv": "MongoDB",
  nats: "NATS",
};

const PORT_NAMES: Record<number, string> = {
  5432: "PostgreSQL", 3306: "MySQL", 6379: "Redis",
  5672: "RabbitMQ", 27017: "MongoDB", 9200: "Elasticsearch",
  9000: "S3/MinIO", 8500: "Consul", 4222: "NATS",
  11211: "Memcached", 9092: "Kafka",
};

/** URL patterns in env var values. */
const URL_PATTERN = /^(\w+):\/\/(?:[^:@]+(?::[^@]+)?@)?([^:/?#]+):(\d+)/;

/** Env var names that typically contain service URLs. */
const URL_VAR_PATTERNS = /URL|URI|DSN|ENDPOINT|HOST|BROKER|CONNECTION/i;

/**
 * Scan .env files for infrastructure service URLs.
 *
 * @param envFiles - Paths to check (defaults to common .env locations).
 * @returns Discovered services.
 */
export function scanEnvForServices(
  envFiles: string[] = [".env", ".env.local", ".env.development"],
): DiscoveredService[] {
  const services: DiscoveredService[] = [];
  const seen = new Set<string>();

  for (const envFile of envFiles) {
    if (!existsSync(envFile)) continue;

    const content = readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;

      const varName = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");

      if (!URL_VAR_PATTERNS.test(varName)) continue;

      const match = value.match(URL_PATTERN);
      if (!match) continue;

      const [, protocol, host, portStr] = match;
      const port = parseInt(portStr, 10);
      const name = SERVICE_NAMES[protocol.toLowerCase()] ?? PORT_NAMES[port] ?? `${protocol}:${port}`;
      const key = `${host}:${port}`;

      if (seen.has(key)) continue;
      seen.add(key);

      services.push({ name, host, port, protocol: protocol.toLowerCase(), source: `${envFile}:${varName}` });
    }
  }

  return services;
}
