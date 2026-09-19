FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
ENV PORT=8788
EXPOSE 8788
CMD ["node", "src/server.mjs"]
