# Immich Power Tools — customized build

A friend-shared build of [Immich Power Tools](https://github.com/immich-power-tools/immich-power-tools)
with some extra work baked in:

- **Face Review** — a whole section for fixing face-recognition mistakes
  (review a person's tagged faces, catch wrongly-merged people via clustering,
  find more photos of someone, rename/split/hide faces in bulk).
- **Rate & Cull** — a Lightroom-style photo review screen: pick a source
  (whole library, an album, or a date range), then rate 1-5, pick/reject,
  favorite, and mark reviewed with keyboard shortcuts (remappable — click the
  keyboard icon on that page). Archive/trash are the only actions that
  actually change your library; everything else is reversible tagging.
- **Tag Manager** — browse, rename, nest, and clean up your Immich tags in
  one tree view instead of hunting through individual photos.
- **GPS Manager** — a photo grid and a map side by side for fixing GPS
  data: filter by album/GPS status/date, select photos to see their pins,
  click the map (or search) to pick a spot, and copy/paste locations between
  photos. Save places you use often (like home) as reorderable Favourites
  and apply them with one click. Replaces the old "Missing Locations" tool,
  which is now hidden from the menu.
- **Workflow fixes & extra conditions** — Immich v3 API-key permission fixes,
  paginated workflow triggers (no more 10k cap), plus Tag / Resolution /
  file-size / filename / face-count / time-of-day conditions and a Remove-Tag
  action.

It runs as one extra container next to your existing Immich stack. **It only
reads and annotates** — it never deletes your photos outright; deletions
always go through Immich's own reversible trash.

> **Heads-up on access:** Power Tools has no login wall of its own beyond
> asking you to sign in with your Immich account, and it can see everything in
> the connected Immich database. Run it on your LAN / behind your existing
> reverse proxy — don't expose port 8001 straight to the internet.

The image is **multi-arch**, so it runs on both Intel/AMD (`amd64`) servers and
Apple Silicon / ARM (`arm64`).

Image: `ghcr.io/jonvdveen/immich-power-tools:latest`

---

## What you need first

- A **running Immich** instance (this build targets Immich **v3.x**).
- **Docker** (and Docker Compose for the Mac/Linux path).
- The **Immich database password** — the `DB_PASSWORD` from your Immich `.env`.

---

## Mac / Linux (Docker Compose)

### Step 1: Find your Immich network

Power Tools has to sit on the **same Docker network** as your Immich Postgres
container. List your networks:

```bash
docker network ls
```

You're looking for the one your Immich stack created — usually something like
`immich_default` or `<folder>_default` (e.g. `immich-app_default`). Confirm the
Postgres container is on it:

```bash
docker inspect immich_postgres --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

(If your Postgres container isn't named `immich_postgres`, find it with
`docker ps` — look for the `postgres` image.)

### Step 2: Configure

Create a `docker-compose.yml`:

```yaml
services:
  power-tools:
    container_name: immich_power_tools
    image: ghcr.io/jonvdveen/immich-power-tools:latest
    volumes:
      - immich-power-tools-data:/app/data
    ports:
      - "8001:3000"
    env_file:
      - .env
    networks:
      default:
        name: immich_default # set this to the network you found in Step 1
        external: true

volumes:
  immich-power-tools-data:
```

And a `.env` next to it:

```bash
DB_PASSWORD=                   # your Immich database password
DB_HOST=immich_postgres        # your Postgres container name
DB_PORT=5432
DB_DATABASE_NAME=immich
DB_USERNAME=postgres

IMMICH_URL=http://immich_server:2283   # container name on the shared network, or http://<server-ip>:2283
EXTERNAL_IMMICH_URL=                   # the URL you normally open Immich at
JWT_SECRET=                            # run: openssl rand -hex 32
```

### Step 3: Start it

```bash
docker compose up -d
```

Open **http://\<your-server\>:8001** and sign in with your Immich account.

### Updating later

```bash
docker compose pull
docker compose up -d
```

---

## Unraid

Unraid prefers a ready-made image, which is exactly what this is. There's no
Community Apps template, so you'll add it once by hand.

### The one thing that matters: reaching Immich's database

Power Tools must be able to reach your Immich **Postgres** container. Immich
normally keeps Postgres internal (port 5432 is *not* published to the host), so
the reliable approach is to put Power Tools on the **same Docker network** as
Immich and address the DB by container name.

Find the network + Postgres container name from the Unraid terminal:

```bash
docker ps                          # find your Immich postgres container name
docker network ls                  # find the Immich network (e.g. immich_default)
```

### Add the container (Docker tab → Add Container)

Set **Advanced view** on, then:

| Field | Value |
|---|---|
| **Name** | `immich-power-tools` |
| **Repository** | `ghcr.io/jonvdveen/immich-power-tools:latest` |
| **Network Type** | **Custom** → your Immich network (e.g. `immich_default`) |
| **Port** | Container `3000` → Host `8001` (TCP) |

Add these **Variables** (Add another Path, Port, Variable or Label → *Variable*):

| Variable | Value |
|---|---|
| `DB_HOST` | your Postgres container name (e.g. `immich_postgres`) |
| `DB_PORT` | `5432` |
| `DB_DATABASE_NAME` | `immich` |
| `DB_USERNAME` | `postgres` |
| `DB_PASSWORD` | your Immich DB password |
| `IMMICH_URL` | `http://immich_server:2283` (or `http://<UNRAID-IP>:2283`) |
| `EXTERNAL_IMMICH_URL` | the URL you open Immich at |
| `JWT_SECRET` | a long random string |

Add one **Path** so settings survive updates:

| Field | Value |
|---|---|
| **Container Path** | `/app/data` |
| **Host Path** | `/mnt/user/appdata/immich-power-tools` |

Click **Apply**, then open **http://\<UNRAID-IP\>:8001** and sign in with your
Immich account.

> If your Immich Postgres and Power Tools can't be put on the same Docker
> network, the fallback is to publish Immich's Postgres port (5432) to the host
> and set `DB_HOST` to your Unraid IP. Only do this on a trusted LAN.

### Updating later

Unraid Docker tab → the container → **Force update** (or toggle
*Advanced → Update* to re-pull `:latest`).

---

## Troubleshooting

**"Database connection failed"** — `DB_HOST`/`DB_PORT`/`DB_PASSWORD` are wrong,
or Power Tools isn't on the same network as Postgres. Recheck Step 1 / the
Unraid network note. Test from inside the container:
`docker exec -it immich_power_tools sh -c "nc -zv $DB_HOST 5432"`.

**Can't reach Immich / thumbnails fail** — `IMMICH_URL` isn't reachable from the
container. On the shared network use `http://immich_server:2283`; otherwise use
your server's IP and make sure Immich's port 2283 is reachable.

**Login doesn't work** — sign in with your **Immich** email + password (the same
credentials you use for Immich itself). Make sure `JWT_SECRET` is set.

**Wrong-architecture errors (exec format error)** — shouldn't happen, the image
is multi-arch; if it does, run `docker pull ghcr.io/jonvdveen/immich-power-tools:latest`
to fetch the manifest for your CPU.
