import { app, authentication } from '@microsoft/teams-js';

export { authentication };
export const teamsHostReady = (async () => {
  let timer;
  try {
    await Promise.race([
      app.initialize(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Teams initialization timeout')), 2500); }),
    ]);
    const context = await app.getContext();
    return context.app.host.name === 'Teams' || context.app.host.name === 'TeamsModern';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
})();
