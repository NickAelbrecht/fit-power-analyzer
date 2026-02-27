export interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Try to serve the requested asset first.
    const assetResponse = await env.ASSETS.fetch(request);

    // If the asset exists (not 404), return it as-is.
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // For SPA routes (HTML navigations) that don't match a file,
    // always serve index.html so Angular's router can handle the path.
    const accept = request.headers.get('accept') || '';
    if (request.method === 'GET' && accept.includes('text/html')) {
      const url = new URL(request.url);
      const indexRequest = new Request(`${url.origin}/index.html`, request);
      return env.ASSETS.fetch(indexRequest);
    }

    // Non-HTML 404 (e.g., missing JS/CSS/image) – return original 404.
    return assetResponse;
  },
};
