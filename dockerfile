FROM node:alpine

WORKDIR /app

COPY package.json ./

RUN npm install

COPY index.js ./
COPY config.js ./
COPY overvis.js ./
COPY state.js ./

CMD [ "node", "index.js" ]