import { MQTTServer } from "./init";

(async () => {
  const server = new MQTTServer();
  await server.initializeRealtimeEvents();
  await server.initHttpServer();
})();
