const { IgApiClient } = require('instagram-private-api');
const { withRealtime } = require('instagram-mqtt');

(async () => {
  const ig = new IgApiClient();

  ig.state.generateDevice('blendscrafters');
  
  // Perform user login
  await ig.account.login('blendscrafters', '@240Maple');
  
  // Wrap the ig client with the Realtime feature
  const realtime = withRealtime(ig);

  // Start the realtime client
  await realtime.connect({
    irisData: await ig.feed.directInbox().request(),
  });

  // Listening for notifications (e.g., messages, comments)
  realtime.on('message', async (data) => {
    console.log('Received message:', data);
  });

  realtime.on('direct', async (data) => {
    console.log('Received direct message:', data);
  });

  realtime.on('realtimeSub', async (data) => {
    console.log('Received realtime subscription data:', data);
  });

  // Add more event listeners as needed for notifications
})();
