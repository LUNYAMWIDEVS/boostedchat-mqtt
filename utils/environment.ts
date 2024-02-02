import { cleanEnv, email, json, num, str, url } from "envalid";

declare module "bun" {
  interface Env {
    PROXY_USERNAME: string;
    PROXY_PASSWORD: string;
    API_URL: string;
    CLIENT_ORG: string;
    EMAIL_USER: string;
    EMAIL_PASSWORD: string;
    EMAIL_RECIPIENTS: string;
    SMTP_HOST: string;
    SMTP_PORT: number;
    AMQP_HOST: string;
    POSTGRES_HOST: string;
    POSTGRES_PORT: number;
    POSTGRES_USERNAME: string;
    POSTGRES_PASSWORD: string;
    POSTGRES_DBNAME: string;
    REDIS_HOST: string;
    REDIS_PORT: number;
  }
}

export const validateEnv = () => {
  const envs = {
    PROXY_USERNAME: str(),
    PROXY_PASSWORD: str(),
    API_URL: url(),
    AMQP_HOST: str(),
    CLIENT_ORG: str(),
    EMAIL_USER: email(),
    EMAIL_PASSWORD: str(),
    SMTP_HOST: str(),
    SMTP_PORT: num(),
    EMAIL_RECIPIENTS: json<string[]>(),
    POSTGRES_HOST: str(),
    POSTGRES_PORT: str(),
    POSTGRES_USERNAME: str(),
    POSTGRES_PASSWORD: str(),
    POSTGRES_DBNAME: str(),
    REDIS_HOST: str(),
    REDIS_PORT: str(),
  };
  cleanEnv(process.env, envs);
};
