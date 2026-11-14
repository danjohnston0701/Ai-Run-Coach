# Ai Run Coach server + website (server/, client/, shared/schema.ts).
# Explicit recipe so hosts don't guess the stack — the repo also holds Android/Gradle
# projects, which made Railway's auto-builder pick Java.
#
# Same steps as Replit's deployment: npm ci → npm run build → npm run start.
FROM node:20-bookworm-slim

WORKDIR /app

# Install dependencies first so this layer is cached between code-only changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source (see .dockerignore for what's left out), then build the web app
# (vite → dist/public) and the server bundle (esbuild → server_dist/).
COPY . .
RUN npm run build

ENV NODE_ENV=production
# The host provides PORT; the server falls back to 3000.
EXPOSE 3000
CMD ["npm", "run", "start"]
