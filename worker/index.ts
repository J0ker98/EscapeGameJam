// Cloudflare Worker entry point for Escape Game Jam API
import OpenAI from 'openai';
import { handleChat } from './chat';
import type { Env } from './env';

const openai = (env: Env) => new OpenAI({ apiKey: env.OPENAI_API_KEY });

function withCORS(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return handleOptions();
    }
    if (request.method === 'POST' && url.pathname === '/chat') {
      return withCORS(await handleChat(request, env));
    }
    return withCORS(new Response('Not found', { status: 404 }));
  },
};

export type { Env }; 