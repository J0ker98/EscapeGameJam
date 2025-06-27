import OpenAI from 'openai';
import type { Env } from './env';

export async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { boredom?: number; hunger?: number; toilet?: number; };
    const { boredom, hunger, toilet } = body;
    if (!boredom || typeof boredom !== 'number') {
      return new Response(JSON.stringify({ error: 'boredom is required', 'boredom': typeof boredom }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!hunger || typeof hunger !== 'number') {
      return new Response(JSON.stringify({ error: 'hunger is required', 'hunger': typeof hunger }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!toilet || typeof toilet !== 'number') {
      return new Response(JSON.stringify({ error: 'toilet is required', 'toilet': typeof toilet }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    // Create thread
    const thread = await client.beta.threads.create();
    const threadId = thread.id;

    // Get personality
    const { personality } = await getPersonality(client);
    if (personality !== '') {
      // Add personality message to thread
      await client.beta.threads.messages.create(threadId, {
        role: 'assistant',
        content: `The NPC personality is: ${personality}.`,
      });
    }

    // Add user stats message to thread
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: `My boredom score is ${boredom}. My hunger score is ${hunger}. My toilet score is ${toilet}.`,
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
    let question = '';
    let answers = [];
    for (const msg of messages.data) {
      if (msg.role === 'assistant' && msg.content && msg.content.length > 0 && msg.content[0].type === 'text') {
        const messageContent = msg.content[0].text.value;
        try {
          const parsed = JSON.parse(messageContent);
          question = parsed.question;
          answers = parsed.answers;
        } catch (e: any) {
          console.error('Failed to parse assistant response as JSON:', e);
          console.error('Raw message content:', messageContent);
          return new Response(JSON.stringify({ 
            error: 'Assistant returned invalid JSON format',
            details: e.message,
            raw_content: messageContent.substring(0, 200) + (messageContent.length > 200 ? '...' : '')
          }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        break;
      }
    }

    return new Response(JSON.stringify({
      question,
      answers,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function getPersonality(client: OpenAI): Promise<{ personality: string }> {
  const personalityPrompt = `Generate a personality description for an NPC in a game where the protagonist needs to convince the NPC to let him alone. The NPC wants to convince the protagonist to let him join his group for the "Malmo Summer School of Artificial Intelligence and Games" Game Jam session. There are mostly weird people at the conference. The personality should be a single sentence. The personality is the personality of the NPC.`;
  // Use chat completion with text response
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: personalityPrompt },
    ],
    response_format: { type: 'text' },
  });
  return { personality: completion.choices[0]?.message?.content || '' };
}