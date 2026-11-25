# ---- build the React app ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- API that also serves the built app ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
ENV CLIENT_DIST=/app/client/dist UPLOAD_DIR=/data/uploads PORT=4000
EXPOSE 4000
CMD ["node", "src/index.js"]
