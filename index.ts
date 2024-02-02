import { requestAccounts } from "./services/accountsRequest";
import { receiveAccounts } from "./services/receiveAccounts";
import { validateEnv } from "./utils/environment";
import "./config/cache";

(async () => {
  console.log("done");
  //validateEnv();
  //await requestAccounts();
  //await receiveAccounts();
})();
