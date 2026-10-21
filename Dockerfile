# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY apps/operator/package.json apps/operator/
COPY apps/widget/package.json apps/widget/
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/apps/operator/dist apps/operator/dist
COPY --from=build /app/apps/widget/dist apps/widget/dist

RUN cd server && npm install --omit=dev

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
