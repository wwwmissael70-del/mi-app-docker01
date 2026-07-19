FROM node:20-alpine

# Habilitar Corepack para Yarn
RUN corepack enable && corepack prepare yarn@stable --activate

WORKDIR /usr/src/app

# Copiar solo los archivos de dependencias primero (mejor caché de capas)
COPY package.json yarn.lock .yarnrc.yml ./

# Instalar dependencias en modo producción
RUN yarn install

# Copiar el resto del código
COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]