FROM node:24-alpine AS build
WORKDIR /app/server
COPY server/package.json ./
RUN npm install
COPY server/ ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY server/drizzle ./drizzle
COPY server/public ./public
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
