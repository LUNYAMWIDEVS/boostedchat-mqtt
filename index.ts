/* eslint-disable no-console */
import { IgApiClientRealtime, withRealtime } from "instagram_mqtt";
import { GraphQLSubscriptions } from "instagram_mqtt";
import { IgApiClient } from "instagram-private-api";
import { SkywalkerSubscriptions } from "instagram_mqtt";

(async () => {
  // this extends the IgApiClient with realtime features
  const ig: IgApiClientRealtime = withRealtime(
    new IgApiClient()
    /* you may pass mixins in here */
  );
  // You must generate device id's before login.
  // Id's generated based on seed
  // So if you pass the same value as first argument - the same id's are generated every time
  ig.state.generateDevice(process.env.IG_USERNAME ?? "mugaokuku");
  // Optionally you can setup proxy url
  // ig.state.proxyUrl = process.env.IG_PROXY;
  // Execute all requests prior to authorization in the real Android application
  // Not required but recommended
  // await ig.simulate.preLoginFlow();
  const loggedInUser = await ig.account.login(
    process.env.IG_USERNAME ?? "mugaokuku",
    process.env.IG_PASSWORD ?? "DarwinOkuku1*"
  );
  // The same as preLoginFlow()
  // Optionally wrap it to process.nextTick so we dont need to wait ending of this bunch of requests
  // process.nextTick(async () => await ig.simulate.postLoginFlow());
  // Create UserFeed instance to get loggedInUser's posts
  const userFeed = ig.feed.user(loggedInUser.pk);
  const myPostsFirstPage = await userFeed.items();
  // All the feeds are auto-paginated, so you just need to call .items() sequentially to get next page
  const myPostsSecondPage = await userFeed.items();
  console.log(myPostsFirstPage);
  console.log(myPostsSecondPage);
  // regular login
  // loginToInstagram()

  // now `ig` is a client with a valid session

  // whenever something gets sent and has no event, this is called
  ig.realtime.on("receive", (topic, messages) =>
    console.log("receive", topic, messages)
  );

  // this is called with a wrapper use {message} to only get the "actual" message from the wrapper
  ig.realtime.on("message", logEvent("messageWrapper"));

  // a thread is updated, e.g. admins/members added/removed
  ig.realtime.on("threadUpdate", logEvent("threadUpdateWrapper"));

  // other direct messages - no messages
  ig.realtime.on("direct", logEvent("direct"));

  // whenever something gets sent to /ig_realtime_sub and has no event, this is called
  ig.realtime.on("realtimeSub", logEvent("realtimeSub"));

  // whenever the client has a fatal error
  ig.realtime.on("error", console.error);

  ig.realtime.on("close", () => console.error("RealtimeClient closed"));

  // connect
  // this will resolve once all initial subscriptions have been sent
  await ig.realtime.connect({
    // optional
    graphQlSubs: [
      // these are some subscriptions
      GraphQLSubscriptions.getAppPresenceSubscription(),
      GraphQLSubscriptions.getZeroProvisionSubscription(ig.state.phoneId),
      GraphQLSubscriptions.getDirectStatusSubscription(),
      GraphQLSubscriptions.getDirectTypingSubscription(ig.state.cookieUserId),
      GraphQLSubscriptions.getAsyncAdSubscription(ig.state.cookieUserId),
    ],
    // optional
    skywalkerSubs: [
      SkywalkerSubscriptions.directSub(ig.state.cookieUserId),
      SkywalkerSubscriptions.liveSub(ig.state.cookieUserId),
    ],
    // optional
    // this enables you to get direct messages
    irisData: await ig.feed.directInbox().request(),
    // optional
    // in here you can change connect options
    // available are all properties defined in MQTToTConnectionClientInfo
    connectOverrides: {},
    // optional
    // use this proxy
    /*
    socksOptions: {
      type: 5,
      port: 12345,
      host: "...",
    },
    */
  });

  /*
  // simulate turning the device off after 2s and turning it back on after another 2s
  setTimeout(() => {
    console.log("Device off");
    // from now on, you won't receive any realtime-data as you "aren't in the app"
    // the keepAliveTimeout is somehow a 'constant' by instagram
    ig.realtime.direct.sendForegroundState({
      inForegroundApp: false,
      inForegroundDevice: false,
      keepAliveTimeout: 900,
    });
  }, 2000);
  setTimeout(() => {
    console.log("In App");
    ig.realtime.direct.sendForegroundState({
      inForegroundApp: true,
      inForegroundDevice: true,
      keepAliveTimeout: 60,
    });
  }, 4000);
  */

  /*
  // an example on how to subscribe to live comments
  // you can add other GraphQL subs using .subscribe
  await ig.realtime.graphQlSubscribe(
    GraphQLSubscriptions.getLiveRealtimeCommentsSubscription("<broadcast-id>")
  );
  */
})();

/**
 * A wrapper function to log to the console
 * @param name
 * @returns {(data) => void}
 */
function logEvent(name: string) {
  return (data: any) => console.log(name, data);
}
