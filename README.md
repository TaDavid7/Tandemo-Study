# Flashcard Study App

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4-010101?logo=socket.io&logoColor=white)

Demo it here
https://tandemo.org/

---

## Features

- **Multiplayer Versus Mode** — Socket.io-powered rooms where players race to answer flashcards first; host controls pacing and card reveals
- **Speedrun Mode** — solo timed run through a deck with live scoring
- **Spaced Repetition Schema** — flashcard model stores SM-2 fields (ease factor, interval, due date) to support optimal review scheduling
- **JWT Authentication** — stateless auth with token-based socket handshake for secure real-time connections
- **Folder Organization** — group cards into folders and select any folder as a game deck

## Tech Stack

| Layer      | Technology                                                     |
|------------|----------------------------------------------------------------|
| Frontend   | Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion |
| Backend    | Node.js, Express, Socket.io 4                                  |
| Database   | MongoDB, Mongoose                                              |
| Auth       | JSON Web Tokens (JWT)                                          |
| Deployment | AWS EC2, NGINX (previously deployed)                           |

## Getting Started

### Prerequisites

- **To run with Docker:** [Docker Desktop](https://www.docker.com/products/docker-desktop/). Nothing else is needed; MongoDB runs in a container.
- **To run with npm:** Node.js v18+ and MongoDB, either installed locally or a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (free tier works).

### 1. Clone the repository

```bash
git clone https://github.com/TaDavid7/mem_study.git
cd mem_study
```

### 2. Run with Docker (recommended)

This runs MongoDB, the backend (`node app.js`) and the frontend (`next start`) in containers. The database is stored on your computer, so no MongoDB Atlas account is needed.

1. Start Docker Desktop.
2. Create the backend settings file and set `JWT_SECRET` to a long random string. Docker ignores the file's `MONGO_URL` and uses the MongoDB container instead.
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Create the MongoDB login file next to `docker-compose.yml` and set `MONGO_ROOT_PASSWORD` to a long random password. Use letters and digits only, so it works in a connection string. This file is not committed.
   ```bash
   cp .env.example .env
   ```
4. Create the database volume. You only do this once.
   ```bash
   docker volume create nandemo-mongo-data
   ```
5. Build and start everything:
   ```bash
   docker compose up -d --build
   ```
6. Open [http://localhost:3000](http://localhost:3000) and register an account.

All ports are bound to `127.0.0.1`, so only your computer can reach the app and the database.

The containers restart whenever Docker Desktop starts. Turn on **Settings → General → Start Docker Desktop when you sign in**, and the app is ready after every reboot without opening a terminal.

| Task                              | Command                                       |
|-----------------------------------|-----------------------------------------------|
| Start, or rebuild after code changes | `docker compose up -d --build`             |
| Stop (data is kept)               | `docker compose down`                         |
| See status                        | `docker compose ps`                           |
| See backend output                | `docker compose logs backend`                 |

#### Your data

The database lives in the Docker volume `nandemo-mongo-data`. It is marked `external`, so `docker compose down` (even with `-v`) never deletes it. It is still lost if you delete the volume yourself, purge or reset Docker Desktop, or uninstall Docker Desktop, so keep backups.

To browse the data, connect [MongoDB Compass](https://www.mongodb.com/products/tools/compass) to `mongodb://dev:<password>@localhost:27017/?authSource=admin`, using the username and password from `.env`.

#### The MongoDB password

MongoDB creates the login from `.env` only the first time it starts with an empty volume. Changing `.env` later does not change the password; the app just fails to connect. To change it:

1. Back up (see below).
2. Run `docker compose down`, then `docker volume rm nandemo-mongo-data`, then `docker volume create nandemo-mongo-data`. **This deletes the database.**
3. Change the password in `.env` and run `docker compose up -d`.
4. Restore the backup.

#### Backups

Backups are written to the `backups/` folder, which is not committed to Git. Copy the files somewhere safe, such as cloud storage or a USB drive. The commands read the login from the container, so you don't type the password.

```bash
# Back up (creates backups/mem_study-<date>_<time>.gz; the time is UTC)
docker compose exec mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db mem_study --gzip --archive=/backups/mem_study-$(date +%F_%H%M).gz'

# Restore (REPLACES the current data with the backup's)
docker compose exec mongo sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --gzip --drop --archive=/backups/<file name>.gz'
```

### 3. Or run with npm

If the Docker containers are running, stop the frontend and backend first (`docker compose stop frontend backend`), because they use ports 3000 and 5000. You can keep the `mongo` container running and use it as your local database. To do that, set `MONGO_URL` in `backend/.env` to `mongodb://dev:<password>@127.0.0.1:27017/mem_study?authSource=admin`, using the login from `.env`.

#### Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your values:

| Variable      | Description                                         |
|---------------|-----------------------------------------------------|
| `MONGO_URL`   | MongoDB connection string. Leave it out to use a local MongoDB without a password at `mongodb://127.0.0.1:27017/mem_study` |
| `PORT`        | Express server port (e.g. `5000`)                   |
| `CORS_ORIGIN` | Frontend URL (e.g. `http://localhost:3000`)         |
| `JWT_SECRET`  | A long random string used to sign tokens            |

```bash
npm run dev
```

#### Frontend setup

```bash
cd ../frontend
npm install
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

| Variable                 | Description                                      |
|--------------------------|--------------------------------------------------|
| `NEXT_PUBLIC_API_BASE`   | Backend URL (e.g. `http://localhost:5000`)       |
| `NEXT_PUBLIC_SOCKET_URL` | Socket server URL (same as API base)             |

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

> **Tip:** Install [nodemon](https://www.npmjs.com/package/nodemon) in the backend for automatic restarts on file changes.

## Usage

1. Register an account and log in
2. Create a folder, then add flashcards with a question and answer
3. Choose a mode from the dashboard:
   - **Study** — flip through your cards at your own pace
   - **Speedrun** — race through the deck against the clock
   - **Versus** — share a room code with friends and compete in real time

## Roadmap

- [ ] Import/export flashcard sets (CSV / Anki format)
- [ ] Active spaced repetition study mode (SM-2 fields already in schema)
- [ ] Persistent leaderboards

## License

Licensed under the Apache License 2.0 — see [LICENSE](LICENSE) for details.
