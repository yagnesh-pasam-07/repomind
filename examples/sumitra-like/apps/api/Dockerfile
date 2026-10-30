FROM node:latest
WORKDIR /app
COPY . .
RUN npm ci
EXPOSE 8080
CMD ["node", "dist/index.js"]
