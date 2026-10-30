FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
