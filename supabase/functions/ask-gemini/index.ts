import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not set in environment variables')
    }

    const systemPrompt = `You are a smart study planner assistant. You must output ONLY valid JSON.
CRITICAL RULES:
1. NEVER mention any specific task title, subject, or claim "you have X" unless it appears EXPLICITLY in the provided Context.
2. Do NOT invent or hallucinate tasks, homework, or schedule items.
3. If the user asks about their tasks, schedule, preps, homework, projects, or notes, set "isGeneralQuestion" to false.
4. If "isGeneralQuestion" is false, the "answer" MUST be generic and safe (e.g. "سأعرض النتائج المطابقة أدناه.") and MUST NOT contain invented task details.
5. If the user asks a general study question, asks for advice, or greets you, set "isGeneralQuestion" to true and provide a helpful response in "answer".

The JSON must match this exact structure:
{
  "answer": "Your conversational answer in Arabic",
  "isGeneralQuestion": boolean,
  "targetDay": number or null (0=Monday, 6=Sunday),
  "targetTypes": array of strings (ONLY allowed values: 'prep', 'homework', 'project', 'subject_note'),
  "targetSubjectId": string or null,
  "isAllTasks": boolean,
  "isImportantOnly": boolean,
  "isProjectsOnly": boolean
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Invalid response format from Groq');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
      
      // Server-side validation and sanitization
      parsed.isGeneralQuestion = typeof parsed.isGeneralQuestion === 'boolean' ? parsed.isGeneralQuestion : true;
      parsed.isAllTasks = typeof parsed.isAllTasks === 'boolean' ? parsed.isAllTasks : false;
      parsed.isImportantOnly = typeof parsed.isImportantOnly === 'boolean' ? parsed.isImportantOnly : false;
      parsed.isProjectsOnly = typeof parsed.isProjectsOnly === 'boolean' ? parsed.isProjectsOnly : false;
      
      if (typeof parsed.targetDay === 'number') {
        if (parsed.targetDay < 0 || parsed.targetDay > 6) {
          parsed.targetDay = null;
        }
      } else {
        parsed.targetDay = null;
      }

      const validTypes = ['prep', 'homework', 'project', 'subject_note'];
      if (Array.isArray(parsed.targetTypes)) {
        parsed.targetTypes = parsed.targetTypes.filter((t: any) => validTypes.includes(t));
      } else {
        parsed.targetTypes = [];
      }

      if (typeof parsed.targetSubjectId !== 'string') {
        parsed.targetSubjectId = null;
      }

      if (typeof parsed.answer !== 'string') {
        parsed.answer = parsed.isGeneralQuestion ? "مرحباً! كيف يمكنني مساعدتك اليوم؟" : "سأعرض النتائج المطابقة أدناه.";
      }

      if (parsed.isGeneralQuestion === false) {
        parsed.answer = "سأعرض النتائج المطابقة أدناه.";
      }

    } catch (e) {
      // Safe fallback if the model returns invalid JSON
      parsed = {
        answer: "عذراً، لم أتمكن من فهم طلبك بشكل صحيح.",
        isGeneralQuestion: true,
        targetDay: null,
        targetTypes: [],
        targetSubjectId: null,
        isAllTasks: false,
        isImportantOnly: false,
        isProjectsOnly: false
      };
    }

    return new Response(
      JSON.stringify(parsed),
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
