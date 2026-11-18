# Rules service of the online table. Build context: the repository root (see deploy/docker-compose.yml).
# No build step and no packages: Node runs the TypeScript sources directly (type stripping).
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8090
RUN useradd --system --uid 10001 app
# The engine is shared with the frontend (previews in the browser) and lives in its tree.
COPY --chown=app:app frontend/src/lib/eld frontend/src/lib/eld
COPY --chown=app:app rules/mapping.ts rules/service.ts rules/server.ts rules/
USER app
EXPOSE 8090
CMD ["node", "--experimental-strip-types", "--no-warnings", "rules/server.ts"]
