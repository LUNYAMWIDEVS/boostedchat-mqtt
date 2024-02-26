import { DirectThreadRepositoryBroadcastResponsePayload } from "instagram-private-api";
import { httpLogger } from "../config/logger";
import { Mailer } from "../services/mailer/mailer";
import { AccountInstances } from "../instances";

export class HttpServer {
  private mailer: Mailer;
  private accountInstances = AccountInstances.allAccountInstances();

  constructor() {
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
          username_from: string;
          username_to: string;
        };
        const userId = await this.accountInstances
          .get(data.username_from)!
          .instance.user.getIdByUsername(data.username_to);
        const thread = this.accountInstances
          .get(data.username_from)!
          .instance.entity.directThread([userId.toString()]);

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
          subject: `Sending message error`,
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
          username_from: string;
          username_to: string;
          links: string;
          mediaId: string;
        };
        const userId = await this.accountInstances
          .get(data.username_from)!
          .instance.user.getIdByUsername(data.username_to);
        const thread = this.accountInstances
          .get(data.username_from)!
          .instance.entity.directThread([userId.toString()]);

        if (data.mediaId) {
          try{
            await thread.broadcastPost(data.mediaId);
          }catch(err){
            this.mailer.send({
              subject: `Sending media error`,
              text: `Hi team, There was an error sending a media to a lead but nevertheless we are still proceeding without the media and reaching out.\nThe error message is \n${
                (err as Error).message
              }\nand the stack trace is as follows:\n${
                (err as Error).stack
              }\nPlease check on this.`,
            });
          }
        } else {
          await this.mailer.send({
            subject: `Unable to send media`,
            text: `Hi team,\n the server was unable to send media to ${data.username_to} because media id was absent. The message has however been sent`,
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
        console.log("send media error", err);
        httpLogger.error({
          level: "error",
          label: "Sending link error",
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        await this.mailer.send({
          subject: `Sending media error`,
          text: `Hi team, There was an error sending a media to a lead.\nThe error message is \n${
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
          username_from: string;
        };
        const imageResp = await fetch(data.imageURL, {
          method: "GET",
        });
        const imageBuffer = await imageResp.blob();

        this.accountInstances.get(data.username_from)!.instance.publish.photo({
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
          subject: `Posting media error`,
          text: `Hi team, There was an error sending some media to a lead.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });

        return new Response("There was an error", { status: 400 });
      }
    }
    if (request.method === "POST" && url.pathname === "/trigger-disconnect") {
      try {
        const data = (await request.json()) as {
          username_from: string;
        };
        await this.accountInstances
          .get(data.username_from)!
          .instance.realtime.disconnectDirty();

        return new Response(
          JSON.stringify({
            status: "OK",
          })
        );
      } catch (err) {
        console.log("Disconnect error", err);
        httpLogger.error({
          level: "error",
          label: "Sending link error",
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        return new Response("There was an error", { status: 400 });
      }
    }
    if (request.method === "POST" && url.pathname === "/trigger-reconnect") {
      try {
        return new Response(
          JSON.stringify({
            status: "OK",
          })
        );
      } catch (err) {
        console.log("Disconnect error", err);
        httpLogger.error({
          level: "error",
          label: "Sending link error",
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        return new Response("There was an error", { status: 400 });
      }
    }
    return new Response("Hello from Bun!");
  }
}
