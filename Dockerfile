FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/support/package.json apps/support/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ARG SERVER_INTERNAL_URL=http://server:8000
ENV SERVER_INTERNAL_URL=$SERVER_INTERNAL_URL
RUN pnpm build

FROM base AS server
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile --prod --filter @supportly/server... --ignore-scripts
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/db/migrations db/migrations
RUN mkdir -p /app/media && chown node:node /app/media
EXPOSE 8000
USER node
CMD ["node", "apps/server/dist/bootstrap/server.js"]

FROM node:22-alpine AS admin
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8000
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 8000
USER node
CMD ["node", "apps/admin/server.js"]

FROM node:22-alpine AS support
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=8000
COPY --from=build /app/apps/support/.next/standalone ./
COPY --from=build /app/apps/support/.next/static ./apps/support/.next/static
COPY --from=build /app/apps/support/public ./apps/support/public
EXPOSE 8000
USER node
CMD ["node", "apps/support/server.js"]
