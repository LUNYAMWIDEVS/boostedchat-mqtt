import { AccountRepositoryLoginResponseLogged_in_user } from "instagram-private-api";
import {
  GraphQLSubscriptions,
  IgApiClientRealtime,
  SkywalkerSubscriptions,
} from "instagram_mqtt";
import { eventLogger, httpLogger, libLogger } from "../config/logger";
import { Mailer } from "../services/mailer/mailer";

export class MQTTListener {
  private mailer: Mailer;
  private igInstance: IgApiClientRealtime;
  private loggedInUser: AccountRepositoryLoginResponseLogged_in_user;
  private messageHolder: {
    [key: string]: { messages: string[]; timeoutId: Timer };
  };

  constructor(
    mAccInstance: IgApiClientRealtime,
    mLoggedInUser: AccountRepositoryLoginResponseLogged_in_user
  ) {
    this.igInstance = mAccInstance;
    this.loggedInUser = mLoggedInUser;
    this.mailer = new Mailer();
    this.messageHolder = {};
  }

  public async initializeRealtimeEvents(
    accountInstance: IgApiClientRealtime,
    mLoggedInUser: AccountRepositoryLoginResponseLogged_in_user
  ) {
    accountInstance.realtime.on("receive", (topic, messages) => {
      eventLogger.log({
        level: "info",
        label: "receive",
        message: JSON.stringify(topic) + "" + JSON.stringify(messages),
      });
    });

    accountInstance.realtime.on(
      "message",
      this.logEvent(
        "messageWrapper",
        (mLoggedInUser as AccountRepositoryLoginResponseLogged_in_user).pk
      )
    );

    accountInstance.realtime.on(
      "threadUpdate",
      this.logEvent("threadUpdateWrapper")
    );

    accountInstance.realtime.on("direct", this.logEvent("direct"));

    accountInstance.realtime.on("realtimeSub", this.logEvent("realtimeSub"));

    accountInstance.realtime.on("error", async (err) => {
      await this.mailer.send({
        subject: `${Bun.env.CLIENT_ORG} server: MQTT client error`,
        text: `Hi team, There was an error in mqtt.\nThe error message is \n${
          (err as Error).message
        }\nand the stack trace is as follows:\n${
          (err as Error).stack
        }\nPlease check on this.`,
      });
      if (err.message.toLowerCase().includes("mqttotclient got disconnected")) {
        this.restartMQTTListeners();
      }
      libLogger.log({
        level: "error",
        label: "MQTT error",
        message: JSON.stringify(err),
      });
    });

    accountInstance.realtime.on("disconnect", async () => {
      await this.mailer.send({
        subject: "MQTT client disconnected",
        text: "Hi team, The MQTT Client got disconnected. Please check on this.",
      });

      libLogger.log({
        level: "error",
        label: "MQTT Disconnect",
        message: "Client got disconnected",
      });
    });

    accountInstance.realtime.on("close", async () => {
      await this.mailer.send({
        subject: "Realtime client closed",
        text: "Hi team, The Realtime client closed. Please check on this.",
      });
      libLogger.log({
        level: "error",
        label: "MQTT Closed",
        message: "Realtime client closed",
      });
    });

    await accountInstance.realtime.connect({
      graphQlSubs: [
        // these are some subscriptions
        GraphQLSubscriptions.getAppPresenceSubscription(),
        GraphQLSubscriptions.getZeroProvisionSubscription(
          accountInstance.state.phoneId
        ),
        GraphQLSubscriptions.getDirectStatusSubscription(),
        GraphQLSubscriptions.getDirectTypingSubscription(
          accountInstance.state.cookieUserId
        ),
        GraphQLSubscriptions.getAsyncAdSubscription(
          accountInstance.state.cookieUserId
        ),
      ],
      // optional
      skywalkerSubs: [
        SkywalkerSubscriptions.directSub(accountInstance.state.cookieUserId),
        SkywalkerSubscriptions.liveSub(accountInstance.state.cookieUserId),
      ],
      irisData: await accountInstance.feed.directInbox().request(),
      connectOverrides: {},
    });

    // simulate turning the device off after 2s and turning it back on after another 2s
    setTimeout(() => {
      eventLogger.info("Device off");
      // from now on, you won't receive any realtime-data as you "aren't in the app"
      // the keepAliveTimeout is somehow a 'constant' by instagram
      accountInstance.realtime.direct.sendForegroundState({
        inForegroundApp: false,
        inForegroundDevice: false,
        keepAliveTimeout: 900,
      });
    }, 2000);
    setTimeout(() => {
      eventLogger.info("In App");
      console.log("Started listening");
      accountInstance.realtime.direct.sendForegroundState({
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
          if (data?.message?.thread_id == null || data?.message?.text == null) {
            return;
          }
          if (data?.message?.user_id === userId) {
            await this.receiveSalesRepMessage(
              data?.message?.thread_id,
              data?.message?.text
            );
            return;
          }
          await this.queueMessages(
            data?.message?.thread_id,
            data?.message?.text
          );
        })();
      }
      eventLogger.log({
        level: "info",
        label: name,
        message: JSON.stringify(data),
      });
    };
  }

  private restartMQTTListeners() {
    setTimeout(async () => {
      try {
        await this.initializeRealtimeEvents(this.igInstance, this.loggedInUser);
      } catch (err) {
        await this.mailer.send({
          subject: `${Bun.env.CLIENT_ORG} server: Error restarting listeners`,
          text: `Hi team, There was an error in mqtt.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });
        libLogger.log({
          level: "error",
          label: "MQTT error",
          message: JSON.stringify(err),
        });
      }
    }, 30000);
  }

  private async receiveSalesRepMessage(threadId: string, message: string) {
    try {
      const response = await fetch(
        `${Bun.env.API_BASE_URL}/instagram/dm/${threadId}/save-salesrep-message/`,
        {
          method: "POST",
          body: JSON.stringify({ text: message }),
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.status !== 200) {
        await this.mailer.send({
          subject: `${Bun.env.CLIENT_ORG} Server: Sending sales rep message to API server failed`,
          text: `Hi team, There was an error sending a sales rep message to the api server: ${message} belonging to thread ${threadId}\n. Please check on this.`,
        });
        httpLogger.log({
          level: "error",
          label: "Saving Sales Rep Message error",
          message: JSON.stringify({
            status: response.status,
            text: response.text,
          }),
        });
      }
    } catch (err) {
      httpLogger.error(err);
      await this.mailer.send({
        subject: `${Bun.env.CLIENT_ORG} Server: Sending message error`,
        text: `Hi team, There was an error trying to save a salesrep message.\nThe error message is \n${
          (err as Error).message
        }\nand the stack trace is as follows:\n${
          (err as Error).stack
        }\nPlease check on this.`,
      });
    }
  }

  private async queueMessages(thread_id: string, message: string) {
    let messages = [];
    if (
      this.messageHolder[thread_id] &&
      this.messageHolder[thread_id].messages.length !== 0
    ) {
      messages = [...this.messageHolder[thread_id].messages, message];
      const timeoutId = this.messageHolder[thread_id].timeoutId;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } else {
      messages = [message];
    }

    const newTimeoutId = setTimeout(async () => {
      await this.sendNewMessage(
        thread_id,
        this.messageHolder[thread_id].messages
      );
    }, 60000);

    this.messageHolder[thread_id] = {
      timeoutId: newTimeoutId,
      messages,
    };
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
            const userId = await this.igInstance.user.getIdByUsername(
              body.username
            );
            const thread = this.igInstance.entity.directThread([
              userId.toString(),
            ]);
            await thread.broadcastText(body.generated_comment);
          }, 30000);
        }
      }
    } else {
      await this.mailer.send({
        subject: `${Bun.env.CLIENT_ORG} Server: Response generation failed`,
        text: `Hi team, There was an error generating a response for the message(s): ${messages} belonging to thread ${threadId}\n. Please check on this.`,
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
}
