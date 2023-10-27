import { IgApiClientRealtime, withRealtime } from "instagram_mqtt";
import { GraphQLSubscriptions } from "instagram_mqtt";
import {
  AccountRepositoryLoginResponseLogged_in_user,
  DirectThreadRepositoryBroadcastResponsePayload,
  IgApiClient,
} from "instagram-private-api";
import { SkywalkerSubscriptions } from "instagram_mqtt";

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

  constructor() {
    this.ig = withRealtime(
      new IgApiClient()
      /* you may pass mixins in here */
    );
    this.ig.state.generateDevice(Bun.env.IG_USERNAME);
    this.ig.state.proxyUrl = Bun.env.IG_PROXY;
  }

  public async initializeRealtimeEvents() {
    const loggedInUser = await this.ig.account.login(
      Bun.env.IG_USERNAME,
      Bun.env.IG_PASSWORD
    );

    this.ig.realtime.on("receive", (topic, messages) =>
      console.log("receive", topic, messages)
    );

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

    this.ig.realtime.on("error", console.error);

    this.ig.realtime.on("close", () => console.error("RealtimeClient closed"));

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
      console.log("Device off");
      // from now on, you won't receive any realtime-data as you "aren't in the app"
      // the keepAliveTimeout is somehow a 'constant' by instagram
      this.ig.realtime.direct.sendForegroundState({
        inForegroundApp: false,
        inForegroundDevice: false,
        keepAliveTimeout: 900,
      });
    }, 2000);
    setTimeout(() => {
      console.log("In App");
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
          await this.sendNewMessage(
            data?.message?.thread_id,
            data?.message?.text
          );
        })();
      }
      console.log(name, data);
    };
  }

  private async sendNewMessage(threadId?: string, text?: string) {
    if (threadId == null || text == null) return;
    const response = await fetch(
      `${Bun.env.API_BASE_URL}/instagram/dflow/${threadId}/generate-response/`,
      {
        method: "POST",
        body: JSON.stringify({ message: text }),
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
        const userId = await this.ig.user.getIdByUsername(body.username);
        const thread = this.ig.entity.directThread([userId.toString()]);
        await thread.broadcastText(body.generated_comment);
      }
      console.log(body);
    } else {
      console.log(response.status, response.text);
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
        console.log(err);
        return new Response("There was an error", { status: 400 });
      }
    }
    return new Response("Hello from Bun!");
  }
}

export { MQTTServer };
