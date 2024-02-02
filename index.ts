import { requestAccounts } from "./services/accountsRequest";
import { receiveAccounts } from "./services/receiveAccounts";
import { validateEnv } from "./utils/environment";
import "./config/cache";
import "./config/database";
import { login, logout } from "./services/daos/mqtt.daos";
import { cache } from "./config/cache";

(async () => {
  console.log("done");
  login({
    ig_username: "darwinokuku",
    ig_password: "dskds",
    city: "ss",
    country: "djs",
    available: true,
  });

  const s = await cache.hget("darwinokuku", "instance");
  if (s != null) {
    console.log(JSON.parse(s));
  }
  await logout("darwinokuku");
  const p = await cache.hget("darwinokuku", "instance");
  console.log(p);
  //validateEnv();
  //await requestAccounts();
  //await receiveAccounts();
})();
