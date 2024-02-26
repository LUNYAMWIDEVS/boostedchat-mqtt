export const proxyConstructor = (country: string, city: string) => {
  return `http://${Bun.env.PROXY_PASSWORD}:wifi;${country};starlink;${city};${city}@proxy.soax.com:9000`;
};
