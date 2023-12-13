import { IgApiClient } from "instagram-private-api";
import { withRealtime } from "instagram_mqtt";

export const login = async () => {
  const igInstance = withRealtime(new IgApiClient());
  igInstance.state.generateDevice(Bun.env.IG_USERNAME);

  if (Bun.env.IG_PROXY) {
    igInstance.state.proxyUrl = Bun.env.IG_PROXY;
  }

  const user = await igInstance.account.login(
    Bun.env.IG_USERNAME,
    Bun.env.IG_PASSWORD
  );

  console.log("Logged in successfully");

  return {
    user,
    igInstance,
  };
};
