# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# Skip Playwright browser download (not needed for production)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S clawsuite && adduser -S clawsuite -G clawsuite

# Copy build output and package.json (for any runtime deps)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Expose default port
EXPOSE 3000

USER clawsuite

CMD ["node", "dist/server/server.js"]
