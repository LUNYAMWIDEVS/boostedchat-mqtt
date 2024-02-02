import { withRealtime } from "instagram_mqtt";
import { IgApiClient } from "instagram-private-api";
import { proxyConstructor } from "../../utils/proxyConstructor";
import { cache } from "../../config/cache";
import { decycle } from "../../utils/decycle";
import { SalesRep } from "../../schemas/salesrep.schema";

export const login = async (salesRepAccount: Omit<SalesRep, "id">) => {
  const igInstance = withRealtime(new IgApiClient());
  igInstance.state.generateDevice(salesRepAccount.ig_username);

  if (
    Bun.env.PROXY_USERNAME &&
    Bun.env.PROXY_PASSWORD &&
    salesRepAccount.country &&
    salesRepAccount.city
  ) {
    igInstance.state.proxyUrl = proxyConstructor(
      salesRepAccount.country,
      salesRepAccount.city
    );
  }

  /*
    const user = await igInstance.account.login(
    salesRepAccount.ig_username,
    salesRepAccount.ig_password
  );
  */

  await cache.hset(salesRepAccount.ig_username, {
    instance: JSON.stringify(decycle(igInstance)),
    userId: "USER_ID_HERE", //user.pk
  });
  console.log(`Logged in ${salesRepAccount.ig_username} successfully`);
};

export const logout = async (username: string) => {
  await cache.del(username);
};
