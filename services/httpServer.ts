import { IgApiClientRealtime } from "instagram_mqtt";
import { DirectThreadRepositoryBroadcastResponsePayload } from "instagram-private-api";
import { httpLogger } from "../config/logger";
import { Mailer } from "../services/mailer/mailer";

export class HttpServer {
  private mailer: Mailer;
  private igInstance: IgApiClientRealtime;

  constructor(mAccInstance: IgApiClientRealtime) {
    this.igInstance = mAccInstance;
    this.mailer = new Mailer();
  }

  public initHttpServer() {
    Bun.serve({
      port: 3000,
      fetch: this.bunFetch.bind(this),
    });
  }

  private async bunFetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/send-message") {
      try {
        const data = (await request.json()) as {
          message: string;
          username: string;
        };
        const userId = await this.igInstance.user.getIdByUsername(
          data.username
        );
        const thread = this.igInstance.entity.directThread([userId.toString()]);

        const sent_message = (await thread.broadcastText(
          data.message
        )) as DirectThreadRepositoryBroadcastResponsePayload;

        return new Response(
          JSON.stringify({
            thread_id: sent_message.thread_id,
            timestamp: sent_message.timestamp,
          })
        );
      } catch (err) {
        httpLogger.error(err);
        await this.mailer.send({
          subject: `${Bun.env.CLIENT_ORG} Server: Sending message error`,
          text: `Hi team, There was an error sending a message to a lead.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });
        return new Response("There was an error", { status: 400 });
      }
    }
    if (
      request.method === "POST" &&
      url.pathname === "/send-first-media-message"
    ) {
      try {
        const data = (await request.json()) as {
          message: string;
          username: string;
          links: string;
          mediaId: string;
        };
        const userId = await this.igInstance.user.getIdByUsername(
          data.username
        );
        const thread = this.igInstance.entity.directThread([userId.toString()]);

        if (data.mediaId) {
          await thread.broadcastPost(data.mediaId);
        } else {
          await this.mailer.send({
            subject: `${Bun.env.CLIENT_ORG} Server: Unable to send media`,
            text: `Hi team,\n the server was unable to send media to ${data.username} because media id was absent. The message has however been sent`,
          });
        }
        const sent_message = (await thread.broadcastText(
          data.message
        )) as DirectThreadRepositoryBroadcastResponsePayload;
        return new Response(
          JSON.stringify({
            thread_id: sent_message.thread_id,
            timestamp: sent_message.timestamp,
          })
        );
      } catch (err) {
        console.log("send link error", err);
        httpLogger.error({
          level: "error",
          label: "Sending link error",
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        await this.mailer.send({
          subject: `${Bun.env.CLIENT_ORG} Server: Sending link error`,
          text: `Hi team, There was an error sending a link to a lead.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });
        return new Response("There was an error", { status: 400 });
      }
    }
    if (request.method === "POST" && url.pathname === "/post-media") {
      try {
        const data = (await request.json()) as {
          imageURL: string;
          caption: string;
        };
        const imageResp = await fetch(data.imageURL, {
          method: "GET",
        });
        const imageBuffer = await imageResp.blob();

        this.igInstance.publish.photo({
          file: Buffer.from(await imageBuffer.arrayBuffer()),
          caption: data.caption,
        });

        return new Response(JSON.stringify("OK"));
      } catch (err) {
        console.log("post media error", err);
        httpLogger.error({
          level: "error",
          label: "Sending link error",
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        await this.mailer.send({
          subject: `${Bun.env.CLIENT_ORG} Server: Posting media error`,
          text: `Hi team, There was an error sending some media to a lead.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });

        return new Response("There was an error", { status: 400 });
      }
    }
    return new Response("Hello from Bun!");
  }
}
