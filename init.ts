import { IgApiClientRealtime, withRealtime } from "instagram_mqtt";
import { GraphQLSubscriptions } from "instagram_mqtt";
import {
  AccountRepositoryLoginResponseLogged_in_user,
  DirectThreadRepositoryBroadcastResponsePayload,
  IgApiClient,
} from "instagram-private-api";
import { SkywalkerSubscriptions } from "instagram_mqtt";
import { eventLogger, httpLogger, libLogger } from "./config/logger";
import { Mailer } from "./services/mailer/mailer";

export interface Message {
  event: "patch";
  message_type: 1;
  seq_id: 330;
  tq_seq_id: null;
  mutation_token: "4e13e9a7-45a5-5e6e-b0fe-9d1fc9330f5a";
  realtime: true;
  message: {
    path: string;
    op: string;
    thread_id: string;
    item_id: string; //string of numbers, possibly message id
    user_id: number;
    timestamp: number;
    item_type: "text" | string;
    client_context: string; //string of numbers
    show_forward_attribution: boolean;
    forward_score: null;
    is_shh_mode: boolean;
    otid: string; // a string of numbers
    is_instamadillo_open_backup: boolean;
    is_ae_dual_send: boolean;
    is_ephemeral_exception: boolean;
    is_superlative: boolean;
    paid_partnership_info: {
      is_paid_partnership: boolean;
    };
    text: string;
  };
}

class MQTTServer {
  private ig: IgApiClientRealtime;
  private messageHolder: {
    [key: string]: { messages: string[]; timeoutId: Timer };
  };
  private mailer = new Mailer();

  constructor() {
    this.ig = withRealtime(
      new IgApiClient()
      /* you may pass mixins in here */
    );
    this.ig.state.generateDevice(Bun.env.IG_USERNAME);

    if (Bun.env.IG_PROXY) {
      this.ig.state.proxyUrl = Bun.env.IG_PROXY;
    }
    this.messageHolder = {};
  }

  public async initializeRealtimeEvents() {
    const loggedInUser = await this.ig.account.login(
      Bun.env.IG_USERNAME,
      Bun.env.IG_PASSWORD
    );

    this.ig.realtime.on("receive", (topic, messages) => {
      eventLogger.log({
        level: "info",
        label: "receive",
        message: JSON.stringify(topic) + "" + JSON.stringify(messages),
      });
    });

    this.ig.realtime.on(
      "message",
      this.logEvent(
        "messageWrapper",
        (loggedInUser as AccountRepositoryLoginResponseLogged_in_user).pk
      )
    );

    this.ig.realtime.on("threadUpdate", this.logEvent("threadUpdateWrapper"));

    this.ig.realtime.on("direct", this.logEvent("direct"));

    this.ig.realtime.on("realtimeSub", this.logEvent("realtimeSub"));

    this.ig.realtime.on("error", (err) => {
      libLogger.log({
        level: "error",
        label: "MQTT error",
        message: JSON.stringify(err),
      });
    });

    this.ig.realtime.on("disconnect", () => {
      this.mailer.send({
        subject: "MQTT client disconnected",
        text: "Hi team, The MQTT Client got disconnected. Please check on this.",
      });

      libLogger.log({
        level: "error",
        label: "MQTT Disconnect",
        message: "Client got disconnected",
      });
    });

    this.ig.realtime.on("close", () => {
      this.mailer.send({
        subject: "Realtime client closed",
        text: "Hi team, The Realtime client closed. Please check on this.",
      });
      libLogger.log({
        level: "error",
        label: "MQTT Closed",
        message: "Realtime client closed",
      });
    });

    await this.ig.realtime.connect({
      graphQlSubs: [
        // these are some subscriptions
        GraphQLSubscriptions.getAppPresenceSubscription(),
        GraphQLSubscriptions.getZeroProvisionSubscription(
          this.ig.state.phoneId
        ),
        GraphQLSubscriptions.getDirectStatusSubscription(),
        GraphQLSubscriptions.getDirectTypingSubscription(
          this.ig.state.cookieUserId
        ),
        GraphQLSubscriptions.getAsyncAdSubscription(this.ig.state.cookieUserId),
      ],
      // optional
      skywalkerSubs: [
        SkywalkerSubscriptions.directSub(this.ig.state.cookieUserId),
        SkywalkerSubscriptions.liveSub(this.ig.state.cookieUserId),
      ],
      irisData: await this.ig.feed.directInbox().request(),
      connectOverrides: {},
    });

    // simulate turning the device off after 2s and turning it back on after another 2s
    setTimeout(() => {
      eventLogger.info("Device off");
      // from now on, you won't receive any realtime-data as you "aren't in the app"
      // the keepAliveTimeout is somehow a 'constant' by instagram
      this.ig.realtime.direct.sendForegroundState({
        inForegroundApp: false,
        inForegroundDevice: false,
        keepAliveTimeout: 900,
      });
    }, 2000);
    setTimeout(() => {
      eventLogger.info("In App");
      console.log("Logged in");
      this.ig.realtime.direct.sendForegroundState({
        inForegroundApp: true,
        inForegroundDevice: true,
        keepAliveTimeout: 60,
      });
    }, 4000);
  }

  private logEvent(name: string, userId?: number) {
    return (data: any) => {
      if (name === "messageWrapper" && userId) {
        (async () => {
          if (data?.message?.user_id === userId || !data?.message?.text) return;
          if (data?.message?.thread_id == null || data?.message?.text == null) {
            return;
          }
          this.messageQueue(data?.message?.thread_id, data?.message?.text);
        })();
      }
      eventLogger.log({
        level: "info",
        label: name,
        message: JSON.stringify(data),
      });
    };
  }

  private async messageQueue(thread_id: string, message: string) {
    if (this.messageHolder[thread_id]) {
      if (this.messageHolder[thread_id].messages.length === 0) {
        this.messageHolder[thread_id].messages = [message];
      } else {
        this.messageHolder[thread_id].messages = [
          ...this.messageHolder[thread_id].messages,
          message,
        ];
      }

      const timeoutId = this.messageHolder[thread_id].timeoutId;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const newTimeoutId = setTimeout(async () => {
        await this.sendNewMessage(
          thread_id,
          this.messageHolder[thread_id].messages
        );
      }, 60000);
      this.messageHolder[thread_id].timeoutId = newTimeoutId;
    } else {
      const newTimeoutId = setTimeout(async () => {
        await this.sendNewMessage(
          thread_id,
          this.messageHolder[thread_id].messages
        );
      }, 60000);
      this.messageHolder[thread_id] = {
        messages: [message],
        timeoutId: newTimeoutId,
      };
    }
  }

  private async sendNewMessage(threadId: string, messages: string[]) {
    const response = await fetch(
      `${Bun.env.API_BASE_URL}/instagram/dflow/${threadId}/generate-response/`,
      {
        method: "POST",
        body: JSON.stringify({ message: messages.join("#*eb4*#") }),
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.status === 200) {
      const body = (await response.json()) as {
        status: number;
        generated_comment: string;
        text: string;
        success: boolean;
        username: string;
      };

      if (body.status === 200) {
        delete this.messageHolder[threadId];
        if (body.generated_comment === "Come again") {
          //send email
          const humanTakeover = await fetch(
            `${Bun.env.API_BASE_URL}/instagram/fallback/${threadId}/assign-operator/`,
            {
              method: "POST",
              body: JSON.stringify({ assigned_to: "Human" }),
              headers: { "Content-Type": "application/json" },
            }
          );
          if (humanTakeover.status === 200) {
            const humanTakeoverBody = (await humanTakeover.json()) as {
              status: number;
              assign_operator: boolean;
            };
            httpLogger.log({
              level: "info",
              label: "Human Takeover Body",
              message: JSON.stringify(humanTakeoverBody),
            });
          }
        } else {
          setTimeout(async () => {
            const userId = await this.ig.user.getIdByUsername(body.username);
            const thread = this.ig.entity.directThread([userId.toString()]);
            await thread.broadcastText(body.generated_comment);
          }, 30000);
        }
      }
    } else {
      this.mailer.send({
        subject: "Generating response failed",
        text: `Hi team, There was an error generating a response for thread ${threadId}. Please check on this.`,
      });
      httpLogger.log({
        level: "error",
        label: "Generate response error",
        message: JSON.stringify({
          status: response.status,
          text: response.text,
        }),
      });
    }
  }

  public async initHttpServer() {
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
        const userId = await this.ig.user.getIdByUsername(data.username);
        const thread = this.ig.entity.directThread([userId.toString()]);

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
        this.mailer.send({
          subject: "Send message error",
          text: `Hi team, There was an error sending a message to a lead.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });
        return new Response("There was an error", { status: 400 });
      }
    }
    if (request.method === "POST" && url.pathname === "/send-link") {
      try {
        const data = (await request.json()) as {
          message: string;
          username: string;
          links: string;
          mediaId: string;
        };
        const userId = await this.ig.user.getIdByUsername(data.username);
        const thread = this.ig.entity.directThread([userId.toString()]);

        await thread.broadcastPost(data.mediaId);
        await thread.broadcastText(data.message);

        return new Response(JSON.stringify("OK"));
      } catch (err) {
        console.log("send link error", err);
        httpLogger.error({
          level: "error",
          label: "Sending link error",
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        this.mailer.send({
          subject: "Send message error",
          text: `Hi team, There was an error sending a link to a lead.\n The error message is ${
            (err as Error).message
          }.\n Please check on this.`,
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

        this.ig.publish.photo({
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
        this.mailer.send({
          subject: "Post media error",
          text: `Hi team, There was an error sending some media to a lead.\n The error message is ${
            (err as Error).message
          }.\n Please check on this.`,
        });

        return new Response("There was an error", { status: 400 });
      }
    }
    return new Response("Hello from Bun!");
  }
}

export { MQTTServer };
