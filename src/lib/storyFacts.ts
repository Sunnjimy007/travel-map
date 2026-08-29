import { supabase } from './supabase'

// Generating a fact needs a server-side web-lookup + summarise call (keys
// can't live in the client) — see supabase/functions/generate-story-fact.
// There's no client-visible signal for "is the Edge Function's Anthropic key
// set", so this is a manual flag you flip on once you've deployed it.
export const isFactApiConfigured = import.meta.env.VITE_ENABLE_STORY_FACTS === 'true'

export async function generateStoryFact(town: string, country: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-story-fact', {
    body: { town, country },
  })
  if (error) throw new Error(error.message ?? 'Failed to generate a fact')
  if (!data?.fact) throw new Error('No fact came back — try again')
  return data.fact as string
}
