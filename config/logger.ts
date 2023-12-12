import winston from "winston";
import "winston-daily-rotate-file";

const { createLogger, format, transports } = winston;
const { combine, timestamp } = format;

const prodFormat = () => {
  const replaceError = ({ label, level, message, stack, timestamp }: any) => ({
    timestamp,
    label,
    level,
    message,
    stack,
  });

  const replacer = (_: string, value: any) => {
    return value instanceof Error ? replaceError(value) : value;
  };

  return combine(timestamp(), format.json({ replacer }));
};

const transport = (fileName: string) =>
  new transports.DailyRotateFile({
    filename: `${fileName}-%DATE%.log`,
    datePattern: "YYYY-MM-DD",
    dirname: `./logs/${fileName}/`,
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
  });

export const eventLogger = createLogger({
  exitOnError: false,
  format: prodFormat(),
  level: "info",
  transports: [transport("mqtt-events")],
});

export const httpLogger = createLogger({
  exitOnError: false,
  format: prodFormat(),
  level: "info",
  transports: [transport("http")],
});

export const libLogger = createLogger({
  exitOnError: false,
  format: prodFormat(),
  level: "info",
  transports: [transport("mqtt-lib")],
});

export const appLogger = createLogger({
  exitOnError: false,
  format: prodFormat(),
  level: "info",
  transports: [transport("app")],
});
