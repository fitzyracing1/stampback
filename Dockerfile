FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 DATA=/data/stampback.json
VOLUME /data
EXPOSE 8080
CMD ["node", "server.js"]
