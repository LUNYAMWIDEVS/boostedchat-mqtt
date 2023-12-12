import { cleanEnv, email, json, num, str, url } from "envalid";

declare module "bun" {
  interface Env {
    IG_USERNAME: string;
    IG_PASSWORD: string;
    API_BASE_URL: string;
    CLIENT_ORG: string;
    EMAIL_USER: string;
    EMAIL_PASSWORD: string;
    EMAIL_RECIPIENTS: string;
    SMTP_HOST: string;
    SMTP_PORT: number;
  }
}

export const validateEnv = () => {
  const envs = {
    IG_USERNAME: str(),
    IG_PASSWORD: str(),
    API_BASE_URL: url(),
    CLIENT_ORG: str(),
    EMAIL_USER: email(),
    EMAIL_PASSWORD: str(),
    SMTP_HOST: str(),
    SMTP_PORT: num(),
    EMAIL_RECIPIENTS: json<string[]>(),
  };
  cleanEnv(process.env, envs);
};
