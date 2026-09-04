# Deployment Guide — Ikigai Backend

NestJS API + MySQL 8 + Redis 7, shipped as a single `docker compose` stack.

---

## 1. Server prerequisites

A Linux server (DigitalOcean droplet / any VPS), 2 GB RAM minimum (4 GB recommended once traffic grows), with:

- Docker Engine + Docker Compose plugin
- Ports: **4040** (API) open to your reverse proxy; **3306 / 6379** should **NOT** be exposed publicly in production.

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out / back in
docker compose version          # verify the plugin is present
```

---

## 2. Get the code + configure secrets

```bash
git clone <your-repo-url> ikigai-main-backend
cd ikigai-main-backend
cp .env.example .env
```

Edit `.env` and set **real production values**:

| Variable | What to do |
|---|---|
| `JWT_SECRET` | **Required.** `openssl rand -base64 48`. Empty = anyone can forge logins. |
| `DB_PASSWORD` | Strong unique password (used by both MySQL and the API). |
| `DB_SYNCHRONIZE` | `true` for the **first** boot to create tables, then set `false` (see §5). |
| `KKIAPAY_SANDBOX` | `false` for live mobile-money payments. |
| `KKIAPAY_SECRET` / `KKIAPAY_*` | Live keys from the Kkiapay dashboard. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Live (`sk_live_…`) keys, not the test keys in the example. |
| `SPACES_KEY` / `SPACES_SECRET` | DigitalOcean Spaces credentials for uploads. |
| `PUBLIC_APP_URL` | Your real domain. |

> `.env` holds live secrets — it is git-ignored and docker-ignored. Never commit it.

---

## 3. Build & start

```bash
docker compose up -d --build
```

This starts three containers (`ikigai-api`, `ikigai-mysql`, `ikigai-redis`). The API waits for MySQL and Redis to be **healthy** before booting.

```bash
docker compose ps           # all should be "running"/"healthy"
docker compose logs -f api  # watch startup; Ctrl-C to stop tailing
```

API is now live on `http://<server-ip>:4040`.

---

## 4. Put it behind HTTPS (reverse proxy)

Don't expose 4040 directly. Terminate TLS with Nginx/Caddy and proxy to the API.

**Caddy** (auto HTTPS, simplest) — `/etc/caddy/Caddyfile`:

```
api.ikilist.com {
    reverse_proxy localhost:4040
}
```

**Nginx** equivalent: `proxy_pass http://127.0.0.1:4040;` in a `server` block, plus `certbot` for the certificate.

Then in `docker-compose.yml` you can drop the public `ports:` mapping for mysql/redis (keep only `api`'s `4040` bound to `127.0.0.1`).

---

## 4b. phpMyAdmin (database UI)

A `phpmyadmin` container ships in the stack, bound to **`127.0.0.1:8081`** only — it is *not* reachable from the public internet. Log in with the MySQL credentials (`root` / `DB_PASSWORD`).

From your laptop, open an SSH tunnel and browse to it locally:

```bash
ssh -L 8081:localhost:8081 user@<server-ip>
# then open http://localhost:8081 in your browser
```

> Never publish phpMyAdmin on a public port. If you must, put it behind the reverse proxy with HTTP basic-auth + HTTPS and a non-obvious path.

---

## 4c. Monitoring (Prometheus + Grafana)

The stack ships Prometheus, Grafana, and four exporters (`node-exporter` for host
CPU/RAM/disk, `cadvisor` for per-container resource use, `mysqld-exporter`,
`redis-exporter`), plus a `/metrics` endpoint on the API itself (request rate,
p95 latency and error rate per route, Node.js process stats). Grafana comes
pre-provisioned with a Prometheus datasource and an "Ikigai — System Overview"
dashboard — nothing to configure by hand.

Like phpMyAdmin, **everything here is bound to `127.0.0.1` only.** Reach it
through an SSH tunnel:

```bash
ssh -L 3000:localhost:3000 -L 9090:localhost:9090 user@<server-ip>
# then open http://localhost:3000 (Grafana) or http://localhost:9090 (Prometheus)
```

Log into Grafana with `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` from `.env`
(set a real password — `changeme` is only a placeholder, same rule as `JWT_SECRET`).

> `mysqld-exporter` currently reuses the MySQL root credentials (simplest, and it's
> never exposed off the box). Switch it to a dedicated least-privilege user
> (`PROCESS`, `REPLICATION CLIENT`, `SELECT` on `performance_schema`) later if
> you want tighter scoping.

**Resource cost**: the monitoring services add up to roughly 800 MB of memory
headroom on top of the API/MySQL/Redis stack (Prometheus 256M, Grafana 256M,
cAdvisor 128M, node-exporter 64M, mysqld-exporter 64M, redis-exporter 32M —
all capped via `deploy.resources.limits`). On the 2 GB minimum from §1 that's
tight; **4 GB+ is a more realistic floor once monitoring is running.**

---

## 5. Database schema (important)

`DB_SYNCHRONIZE=true` lets TypeORM auto-create/alter tables from the entities — convenient for the **first** deploy.

**After the schema exists, set `DB_SYNCHRONIZE=false` and redeploy** (`docker compose up -d`). Leaving auto-sync on in production risks unintended schema changes / data loss when entities evolve. For controlled changes going forward, use TypeORM migrations.

Data persists in named volumes (`mysql_data`, `redis_data`) across restarts and rebuilds.

---

## 6. Common operations

```bash
# Update to latest code
git pull && docker compose up -d --build

# Restart just the API
docker compose restart api

# Tail logs
docker compose logs -f api

# Stop everything (keeps data)
docker compose down

# Stop AND wipe DB/Redis data (destructive!)
docker compose down -v
```

### Backups

```bash
# Dump the database
docker compose exec mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" ikigaidb' > backup-$(date +%F).sql
```

Schedule this with cron and copy the dump off-server.

> The wallet-reconcile script (`npm run reconcile:wallets`) uses `ts-node` + `src/`, which are pruned from the production image. Run it from a dev checkout (`npm install` then `npm run reconcile:wallets`) pointed at the prod DB, or build a dev image if you need it on-server.

---

## 7. Docker Swarm (optional)

The same `docker-compose.yml` also works as a Swarm stack file (every service
has a `deploy:` block). Swarm buys you rolling restarts, declared resource
limits, and `docker service` health/rollback — worth it once you're past a
single hand-run VPS; for a single box on `docker compose up -d`, §3-§6 above
are all you need, so treat this section as opt-in, not a required next step.

```bash
docker swarm init                    # once per host (or per manager node)
docker compose build                 # Swarm doesn't build — bake the image first
docker stack deploy -c docker-compose.yml ikigai
```

Differences from plain `docker compose` worth knowing before you switch:

- **No `build:`.** Swarm only ever pulls/uses the `image:` tag (`ikigai-api:latest`
  by default — override with `IMAGE_TAG` in `.env`). Re-run `docker compose build`
  before every `docker stack deploy` when you change code; on a multi-node swarm
  you'd push that tag to a registry instead so other nodes can pull it.
- **No `depends_on` ordering.** Swarm starts every service immediately rather than
  waiting for MySQL/Redis to report healthy first. `@nestjs/typeorm`'s default
  connection retry (10 attempts, 3s apart) already covers this — no code change
  needed — but a *first* boot on an empty DB may need a manual `docker service
  update --force ikigai_api` if it exhausts its retries before MySQL finishes
  initializing.
- **`container_name` is ignored** (Swarm names containers per-replica/task itself);
  harmless, just don't expect `ikigai-api` as a literal container name under swarm.

Common operations become:

```bash
docker service ls                       # replaces `docker compose ps`
docker service logs -f ikigai_api        # replaces `docker compose logs -f api`
docker service update --image ikigai-api:latest ikigai_api   # rolling redeploy
docker stack rm ikigai                   # replaces `docker compose down`
```

---

## 8. Production checklist

- [ ] `JWT_SECRET` set to a strong random value (not `yourSecretKey`)
- [ ] `DB_PASSWORD` strong & unique
- [ ] `DB_SYNCHRONIZE=false` after first boot
- [ ] `KKIAPAY_SANDBOX=false` + live keys
- [ ] Stripe **live** keys + webhook secret
- [ ] mysql/redis ports **not** publicly exposed
- [ ] API behind HTTPS reverse proxy
- [ ] Automated DB backups scheduled
- [ ] `.env` never committed to git
- [ ] `GRAFANA_ADMIN_PASSWORD` set to a real value (not `changeme`)
- [ ] Grafana/Prometheus ports **not** publicly exposed (127.0.0.1 + SSH tunnel only)
