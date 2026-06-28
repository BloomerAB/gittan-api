FROM node:22-slim AS builder
WORKDIR /app
ARG REGISTRY_TOKEN
ARG NPM_TOKEN
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable \
  && echo "//npm.gittan.eu/:_authToken=${REGISTRY_TOKEN}" >> .npmrc \
  && echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> .npmrc \
  && pnpm install --frozen-lockfile \
  && rm -f .npmrc
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm build

FROM node:22-slim
WORKDIR /app
RUN useradd -r -u 1001 gittan
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY package.json ./
USER 1001
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s CMD node -e "fetch('http://localhost:4000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
