export default {
  async fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    // Delegate all requests to static assets with SPA routing.
    return env.ASSETS.fetch(request);
  },
};
