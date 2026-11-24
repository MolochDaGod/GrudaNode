FROM node:20-alpine

LABEL maintainer="RacAlvin The Pirate King — Grudge Studio"
LABEL description="GRUDA Agent — Local agentic AI workspace"

WORKDIR /app

# Install curl for Ollama health checks
RUN apk add --no-cache curl

COPY package.json .
RUN npm install --production --silent

COPY . .

# Data dirs
ENV DATA_DIR=/data
ENV PROJECTS_DIR=/projects
# Containers must listen on all interfaces; local owner trust stays off (sign in).
ENV GRUDA_HOST=0.0.0.0
RUN mkdir -p /data /projects

EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3200/api/health || exit 1

CMD ["node", "server.js"]
