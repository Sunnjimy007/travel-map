// Supabase Edge Function — generates one kid-level "interesting fact" about
// a place for Holiday Stories (PRD §11). The Anthropic key lives only here
// as a function secret, never in client code.
//
// Deploy: supabase functions deploy generate-story-fact
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Then set VITE_ENABLE_STORY_FACTS=true in the app's env to turn the
// Regenerate button on.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const { town, country } = await req.json()
    if (!town || !country) {
      return new Response(JSON.stringify({ error: 'town and country are required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        messages: [
          {
            role: 'user',
            content: `Find one genuinely interesting, kid-friendly fact about ${town}, ${country} — the kind of thing a curious 10-12 year old would enjoy. Look it up if you need to. Reply with ONLY the fact itself, as 1-2 short sentences a child could read easily. No preamble, no "Did you know", no citations or source markers — just the fact.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${text}`)
    }

    const data = await response.json()
    const fact = data.content
      ?.filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join(' ')
      .trim()

    if (!fact) throw new Error('No fact came back from the model')

    return new Response(JSON.stringify({ fact }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
