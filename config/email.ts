import nodemailer from "nodemailer";

export const mailConfig = nodemailer.createTransport({
  host: Bun.env.SMTP_HOST,
  port: Bun.env.SMTP_PORT,
  secure: true, // use TLS
  auth: {
    user: Bun.env.EMAIL_USER,
    pass: Bun.env.EMAIL_PASSWORD,
  },
});
