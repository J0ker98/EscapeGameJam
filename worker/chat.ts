import OpenAI from 'openai';
import type { Env } from './env';

export async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { message?: string; thread_id?: string };
    const { message, thread_id } = body;
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    let threadId = thread_id;
    if (!threadId) {
      const thread = await client.beta.threads.create();
      threadId = thread.id;

      // Get personality and difficulty
      const { personality, difficulty } = await getPersonalityAndDifficulty(client);

      // Add personality and difficulty message to thread
      await client.beta.threads.messages.create(threadId, {
        role: 'assistant',
        content: `The NPC personality is: ${personality} and your difficulty is: ${difficulty}.`,
      });
    }

    // Add user message to thread
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });
    // Run the assistant
    const run = await client.beta.threads.runs.create(threadId, {
      assistant_id: env.OPENAI_ASSISTANT_ID,
    });
    // Poll for run completion
    let runStatus = run.status;
    let runId = run.id;
    let attempts = 0;
    while (!['completed', 'failed', 'cancelled', 'expired'].includes(runStatus) && attempts < 30) {
      await new Promise((res) => setTimeout(res, 2000));
      const updatedRun = await client.beta.threads.runs.retrieve(runId, { thread_id: threadId });
      runStatus = updatedRun.status;
      attempts++;
    }
    if (runStatus !== 'completed') {
      return new Response(JSON.stringify({ error: `Run did not complete successfully: ${runStatus}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    // Get the latest assistant message
    const messages = await client.beta.threads.messages.list(threadId);
    let responseText = '';
    let answers = [];
    let correctAnswer = 1;
    for (const msg of messages.data) {
      if (msg.role === 'assistant' && msg.content && msg.content.length > 0 && msg.content[0].type === 'text') {
        try {
          const parsed = JSON.parse(msg.content[0].text.value);
          responseText = parsed.response;
          answers = parsed.answers;
          correctAnswer = parsed.correct_answer;
        } catch (e) {
          responseText = msg.content[0].text.value;
        }
        break;
      }
    }

    return new Response(JSON.stringify({
      thread_id: threadId,
      response: responseText,
      answers,
      correct_answer: correctAnswer,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function getPersonalityAndDifficulty(client: OpenAI): Promise<{ personality: string, difficulty: number }> {
  const personalityPrompt = `Generate a personality description for an NPC in a game where the protagonist needs to convince the NPC to let him alone. The NPC wants to convince the protagonist to let him join his group for the "Malmo Summer School of Artificial Intelligence and Games" Game Jam session. There are mostly weird people at the conference. The personality should be a single sentence. The JSON response should be in the following format: {"personality": "...", "difficulty": "..."} and nothing else. The difficulty is the difficulty NPC to be beaten (easy/medium/hard). The personality is the personality of the NPC.`;
  // Use chat completion with JSON schema response
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: personalityPrompt },
    ],
    response_format: { type: 'json_object' },
  });
  let personality = '';
  let difficulty = 0;
  try {
    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      difficulty = parsed.difficulty;
      personality = parsed.personality;
    }
  } catch (e) {
    // fallback: just return 0 and empty reasoning
  }
  return { personality, difficulty };
} 