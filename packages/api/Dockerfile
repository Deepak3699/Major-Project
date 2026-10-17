FROM node:20-alpine AS builder
WORKDIR /build

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/database ./database
COPY --from=builder /build/package*.json ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/tsconfig.json ./
COPY --from=builder /build/src ./src
COPY --from=builder /build/watch.ts ./

EXPOSE 3000
CMD ["node", "--import", "tsx", "watch.ts"]