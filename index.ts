import { MQTTServer } from "./init";
import { validateEnv } from "./utils/environment";

(async () => {
  validateEnv();
  const server = new MQTTServer();
  await server.initializeRealtimeEvents();
  await server.initHttpServer();
})();
