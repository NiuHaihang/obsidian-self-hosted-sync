FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY vitest.workspace.ts ./

RUN npm install --no-audit --no-fund

EXPOSE 8787

CMD ["npm", "run", "start:server"]
