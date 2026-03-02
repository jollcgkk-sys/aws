import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI, Type } from "npm:@google/genai"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt } = await req.json()

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables')
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: {
              type: Type.STRING,
              description: "Your conversational answer in Arabic."
            },
            isGeneralQuestion: {
              type: Type.BOOLEAN,
              description: "True if the user is just greeting or asking a general question not requiring task/schedule filtering."
            },
            targetDay: {
              type: Type.NUMBER,
              description: "The day of the week (0-6) mentioned, where 0=Monday and 6=Sunday, or null if none."
            },
            targetTypes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "The task types mentioned. Allowed values: 'prep', 'homework', 'project', 'subject_note'."
            },
            targetSubjectId: {
              type: Type.STRING,
              description: "The ID of the subject mentioned, or null if none."
            },
            isAllTasks: {
              type: Type.BOOLEAN,
              description: "True if the user wants to see all tasks."
            },
            isImportantOnly: {
              type: Type.BOOLEAN,
              description: "True if the user only wants important tasks."
            },
            isProjectsOnly: {
              type: Type.BOOLEAN,
              description: "True if the user only wants projects."
            }
          },
          required: ["answer", "isGeneralQuestion"]
        }
      }
    });

    return new Response(
      JSON.stringify({ reply: response.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
