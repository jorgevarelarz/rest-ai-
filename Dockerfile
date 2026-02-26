FROM node:22.12-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.12-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.12-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/api ./api
COPY --from=build /app/services ./services
COPY --from=build /app/src ./src
COPY --from=build /app/components ./components
COPY --from=build /app/constants.ts ./constants.ts
COPY --from=build /app/types.ts ./types.ts
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/index.tsx ./index.tsx
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 8080
CMD ["npm", "run", "start"]
