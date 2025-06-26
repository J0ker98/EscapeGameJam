// Cloudflare Worker entry point for Escape Game Jam API
import OpenAI from 'openai';
import { handleChat } from './chat';
import type { Env } from './env';

const openai = (env: Env) => new OpenAI({ apiKey: env.OPENAI_API_KEY });

function withCORS(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === env.API_KEY;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return handleOptions();
    }
    if (!isAuthorized(request, env)) {
      return withCORS(new Response('Unauthorized', { status: 401 }));
    }
    if (request.method === 'POST' && url.pathname === '/chat') {
      return withCORS(await handleChat(request, env));
    }
    return withCORS(new Response('Not found', { status: 404 }));
  },
};

export type { Env }; 