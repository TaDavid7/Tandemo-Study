FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Both are baked into the build (see next.config.ts and src/lib/api.ts).
ARG API_PROXY_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV API_PROXY_URL=$API_PROXY_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
