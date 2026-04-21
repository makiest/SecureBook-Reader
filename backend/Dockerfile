FROM node:18-alpine

# Install OpenSSL for Prisma, and media packages for PDF manipulation
RUN apk add --no-cache graphicsmagick ghostscript enscript openssl libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 8080
VOLUME ["/app/books"]

CMD ["node", "server.js"]
