import { GraphQLSubscriptions, SkywalkerSubscriptions } from "instagram_mqtt";
import { eventLogger, httpLogger, libLogger } from "../config/logger";
import { Mailer } from "../services/mailer/mailer";
import { AccountInstances, TAccountInstances } from "../instances";
import {addLoggedInAccount, removeLoggedInAccount, addConnectedAccount, removeConnectedAccount} from "./accounts"

export class MQTTListener {
  private mailer: Mailer;
  private username: string;
  private accountInstances: TAccountInstances;

  private messageHolder: {
    [key: string]: { messages: string[]; timeoutId: Timer };
  };
  private counter: number;

  constructor(username: string) {
    this.username = username;
    this.mailer = new Mailer();
    this.messageHolder = {};
    this.counter = 0;
    this.accountInstances = AccountInstances.allAccountInstances();
  }

  public registerRealtimeListeners() {
    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on("receive", (topic, messages) => {
        eventLogger.log({
          level: "info",
          label: `${this.username} receive`,
          message: JSON.stringify(topic) + "" + JSON.stringify(messages),
        });
      });

    // Listen for messages
    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on(
        "message",
        this.logEvent(
          "messageWrapper",
          this.accountInstances.get(this.username)!.userId
        )
      );
          
    


    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on(
        "threadUpdate",
        this.logEvent("threadUpdateWrapper")
      );

    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on("direct", (data) => {
        console.log('Received direct message:', data);
      });
      
    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on("realtimeSub", (data) => {
        console.log('Received realtime subscription:', data);
      });

    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on("error", async (err) => {
        console.log(err)
        if (
          err.message.toLowerCase().includes("mqttotclient got disconnected")
        ) {
          console.log(
            `MQTT Client for ${this.username} disconnected at `,
            new Date().toISOString()
          );
          if (this.counter <= 10) {
            this.counter += 1;
            this.reconnectMQTT();
          } else {
            await this.mailer.send({
              subject: `MQTT client for ${this.username} reconnect failure`,
              text: `Hi team,\nThe MQTT Client for ${this.username} attempted to reconnect itself 10 times. Please check if this can be handled manually.`,
            });
            console.log("Attempted 10 times to reconnect ");
          }
        }
        libLogger.log({
          level: "error",
          label: `${this.username} MQTT error`,
          message: JSON.stringify(err),
        });
        await this.mailer.send({
          subject: `${this.username}'s MQTT client error`,
          text: `Hi team, There was an error in ${
            this.username
          }'s mqtt client.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }\nPlease check on this.`,
        });
      });

    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on("disconnect", async () => {
        libLogger.log({
          level: "error",
          label: `${this.username} MQTT Disconnect`,
          message: `${this.username}'s Client cleanly disconnected`,
        });
        // removeLoggedInAccount(this.username)
        removeConnectedAccount(this.username)
        await this.mailer.send({
          subject: `${this.username}'s MQTT client disconnected`,
          text: `Hi team, ${this.username}'s MQTT was safely disconnected. Please check on this.`,
        });
      });

    this.accountInstances
      .get(this.username)
      ?.instance.realtime.on("close", async () => {
        libLogger.log({
          level: "error",
          label: `${this.username} MQTT Closed`,
          message: `Realtime client closed for ${this.username}`,
        });
        await this.mailer.send({
          subject: `${this.username} Realtime client closed`,
          text: `Hi team, ${this.username}'s realtime client closed. Please check on this.`,
        });
      });
  }

  public async connectMQTTBroker() {
    await this.accountInstances.get(this.username)?.instance.realtime.connect({
      graphQlSubs: [
        // these are some subscriptions
        GraphQLSubscriptions.getAppPresenceSubscription(),
        GraphQLSubscriptions.getZeroProvisionSubscription(
          this.accountInstances.get(this.username)!.instance.state.phoneId
        ),
        GraphQLSubscriptions.getDirectStatusSubscription(),
        GraphQLSubscriptions.getDirectTypingSubscription(
          this.accountInstances.get(this.username)!.instance.state.cookieUserId
        ),
        GraphQLSubscriptions.getAsyncAdSubscription(
          this.accountInstances.get(this.username)!.instance.state.cookieUserId
        ),
        // GraphQLSubscriptions.getLiveRealtimeCommentsSubscription(
        //   this.accountInstances.get(this.username)!.instance.state.deviceId
        // )
      ],
      // optional
      skywalkerSubs: [
        SkywalkerSubscriptions.directSub(
          this.accountInstances.get(this.username)!.instance.state.cookieUserId
        ),
        SkywalkerSubscriptions.liveSub(
          this.accountInstances.get(this.username)!.instance.state.cookieUserId
        ),
      ],
      irisData: await this.accountInstances
        .get(this.username)!
        .instance.feed.directInbox()
        .request(),
      connectOverrides: {},
    });

    // simulate turning the device off after 2s and turning it back on after another 2s
    setTimeout(() => {
      eventLogger.info(`${this.username} device off`);
      // from now on, you won't receive any realtime-data as you "aren't in the app"
      // the keepAliveTimeout is somehow a 'constant' by instagram
      this.accountInstances
        .get(this.username)!
        .instance.realtime.direct.sendForegroundState({
          inForegroundApp: false,
          inForegroundDevice: false,
          keepAliveTimeout: 900,
        });
    }, 2000);

    setTimeout(() => {
      eventLogger.info(`${this.username} in app`);
      console.log(`Started listening to ${this.username}`);
      addConnectedAccount(this.username)
      // this.counter = 0;
      this.accountInstances
        .get(this.username)!
        .instance.realtime.direct.sendForegroundState({
          inForegroundApp: true,
          inForegroundDevice: true,
          keepAliveTimeout: 60,
        });
    }, 4000);
    // an example on how to subscribe to live comments
   // you can add other GraphQL subs using .subscribe
  //  await this.accountInstances.get(this.username)!.instance.realtime.graphQlSubscribe(GraphQLSubscriptions.getLiveRealtimeCommentsSubscription('<broadcast-id>'));
  }

  private logEvent(name: string, userId?: number) {
    return (data: any) => {
      if (name === "realtimeSub" && userId) {
        console.log(data)
      }  
      if (name === "direct" && userId) {
        console.log(data)
      }
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
        label: `${this.username} name`,
        message: JSON.stringify(data),
      });
    };
  }

  private async reconnectMQTT() {
    console.log(this.counter);
    setTimeout(async () => {
      try {
        await this.connectMQTTBroker();
        // addLoggedInAccount(this.username)
        addConnectedAccount(this.username)
        console.log(`${this.username}'s client reconnected safely`);
        libLogger.log({
          level: "info",
          label: `${this.username} MQTT reconnection successful`,
          message: `MQTT client for ${this.username} reconnected itself successfully`,
        });
        await this.mailer.send({
          subject: `MQTT Listener restart for ${this.username}`,
          text: `Hi team, The MQTT listener for ${this.username} disconnected but automatically reconnected itself`,
        });
      } catch (err) {
        this.counter += 1;
        console.log(
          `Error while reconnecting ${this.username}'s listener\n`,
          err
        );
        libLogger.log({
          level: "error",
          label: `${this.username} MQTT reconnection error`,
          message: JSON.stringify(err),
        });
        if (this.counter <= 10) {
          this.accountInstances
            .get(this.username)!
            .instance.realtime.removeAllListeners();
          console.log(this.username, "Triggering clean disconnect", err);
          this.accountInstances
            .get(this.username)!
            .instance.realtime.once("disconnect", () => {
              console.log(this.username, "MQTT cleanly disconnected");
              libLogger.log({
                level: "error",
                label: `${this.username} MQTT Disconnect`,
                message: "Client got disconnected cleanly",
              });
              // removeLoggedInAccount(this.username)
              removeConnectedAccount(this.username)
              this.registerRealtimeListeners();
              this.reconnectMQTT();
            });
          this.accountInstances
            .get(this.username)!
            .instance.realtime.emit("disconnect");
        } else {
          console.log(this.username, "Attempted a restart 10 times");
          libLogger.log({
            level: "error",
            label: `${this.username} MQTT Reconnect error`,
            message: "Client cannot restart more than 10 times",
          });
          await this.mailer.send({
            subject: `Error restarting listeners for ${this.username}`,
            text: `The server attempted a clean restart more 10 times and will not make any more attempts`,
          });
        }
        await this.mailer.send({
          subject: `Error restarting listeners for ${this.username}`,
          text: `Hi team, There was an error starting ${
            this.username
          }'s mqtt listeners.\nThe error message is \n${
            (err as Error).message
          }\nand the stack trace is as follows:\n${
            (err as Error).stack
          }.\n\nThis event triggered a clean disconnect, and will attempt to reconnect. Please check on this.`,
        });
      }
    }, 30000);
  }

  private async receiveSalesRepMessage(threadId: string, message: string) {
    try {
      const response = await fetch(
        `${Bun.env.API_URL}/instagram/dm/${threadId}/save-salesrep-message/`,
        {
          method: "POST",
          body: JSON.stringify({ text: message }),
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.status !== 201) {
        /*
        await this.mailer.send({
          subject: `${Bun.env.CLIENT_ORG} Server: Sending sales rep message to API server failed`,
          text: `Hi team, There was an error sending a sales rep message to the api server: ${message} belonging to thread ${threadId}\n. Please check on this.`,
        });
        */
        httpLogger.log({
          level: "error",
          label: `${this.username} Saving Sales Rep Message error`,
          message: JSON.stringify({
            status: response.status,
            text: response.text,
          }),
        });
      }
    } catch (err) {
      httpLogger.error(err);
      await this.mailer.send({
        subject: `Sending ${this.username}'s message error`,
        text: `Hi team, There was an error trying to send ${
          this.username
        }'s message(${message}).\nThe error message is \n${
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
      `${Bun.env.API_URL}/instagram/dflow/${threadId}/generate-response/`,
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
        assigned_to: "Robot" | "Human";
      };
      
      delete this.messageHolder[threadId];
      
      if (body.assigned_to === "Human") {
        return;
      }

      if (body.status === 200) {
        if (body.generated_comment === "Come again") {
          const humanTakeover = await fetch(
            `${Bun.env.API_URL}/instagram/fallback/${threadId}/assign-operator/`,
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
              label: `${this.username} Human Takeover`,
              message: JSON.stringify(humanTakeoverBody),
            });
          }
          await this.mailer.send({
            subject: `Human takeover from ${this.username}`,
            text: `Hi team, The server responded with a 'Come again' to the message(s): ${messages} belonging to thread ${threadId} on ${this.username}'s account.\nThis will most likely result in a human takeover\n. Please check on this.`,
          });
        } else {
          setTimeout(async () => {
            const userId = await this.accountInstances
              .get(this.username)!
              .instance.user.getIdByUsername(body.username);
            const thread = this.accountInstances
              .get(this.username)!
              .instance.entity.directThread([userId.toString()]);
            await thread.broadcastText(body.generated_comment);
          }, 75000);
        }
      }
    } else {
      await this.mailer.send({
        subject: `Response generation failed on ${this.username}`,
        text: `Hi team, There was an error generating a response for the message(s): ${messages} belonging to thread ${threadId}\n. Please check on this.`,
      });
      httpLogger.log({
        level: "error",
        label: `${this.username} Generate response error`,
        message: JSON.stringify({
          status: response.status,
          text: response.text,
        }),
      });
    }
  }
}