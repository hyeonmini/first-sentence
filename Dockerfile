FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY corpus ./corpus
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production
EXPOSE 4567
CMD ["node", "server.js"]
