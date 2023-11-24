import { mailConfig } from "../../config/email";
import { appLogger } from "../../config/logger";

/**
 * class to send emails
 */
class Mailer {
  /**
   * @constructor
   */
  constructor() {
    // none
  }

  /**
   * @param {string} message the actual message to be sent
   */
  public send = async (message: {
    cc?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean | Error> => {
    try {
      await new Promise((rsv, rjt) => {
        mailConfig.sendMail(
          {
            from: Bun.env.EMAIL_USER,
            to: JSON.parse(Bun.env.EMAIL_RECIPIENTS),
            ...message,
          },
          (error) => {
            if (error) {
              console.log(error);
              appLogger.error(error.message);
              return rjt(error);
            }
            rsv("Email sent");
            appLogger.info(`Email sent successfully`);
          }
        );
      });

      return true;
    } catch (error) {
      appLogger.error((error as Error).message);
      throw new Error((error as Error).message);
    }
  };
}

export { Mailer };
