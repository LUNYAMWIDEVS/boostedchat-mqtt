import { HttpServer } from "./services/httpServer";
import { login } from "./services/login";
import { MQTTListener } from "./services/mqttListener";
import { validateEnv } from "./utils/environment";

(async () => {
  validateEnv();
  const loginObj = await login();
  const mqttListener = new MQTTListener(loginObj.igInstance, loginObj.user);
  mqttListener.registerRealtimeListeners();
  await mqttListener.connectMQTTBroker();
  const httpServer = new HttpServer(loginObj.igInstance);
  httpServer.initHttpServer();
})();
