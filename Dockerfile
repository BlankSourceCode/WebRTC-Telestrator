FROM node:21-alpine

ENV APIDIR=/srv/app \
    PORT=80 \
    NODE_ENV=production

RUN mkdir -p ${APIDIR}

EXPOSE ${PORT}
WORKDIR ${APIDIR}
ADD package.json ${APIDIR}/package.json
RUN npm install
ADD ./src ${APIDIR}
CMD npm start
