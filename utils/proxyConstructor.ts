export const proxyConstructor = (country: string, city: string) => {
  return `https://${Bun.env.PROXY_USERNAME};country=${country};city=${city}:${Bun.env.PROXY_PASSWORD}@premium.residential.proxyrack.net:10000`;
};
