FROM node:22-alpine

# python3/make/g++: necessários para compilar o módulo nativo do bcrypt
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install

COPY apps/api apps/api
COPY packages/shared-types packages/shared-types

WORKDIR /app/apps/api
RUN npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "dev"]
