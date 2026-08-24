import http from 'node:http'; import { config } from './config.js'; import { attachRealtime, initialiseRealtime } from './realtime.js'; import { startWorker } from './jobs.js'; import { allowedOrigin, createApp } from './app.js';
const server = http.createServer(createApp()), io = initialiseRealtime(server, allowedOrigin);
io.on('connection', attachRealtime); startWorker(); server.listen(config.port, config.host, () => console.log(`API listening on ${config.host}:${config.port}`));
