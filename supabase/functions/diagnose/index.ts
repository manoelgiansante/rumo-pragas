import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Rate limiting: simple in-memory counter (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 diagnoses per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

const SYSTEM_PROMPT = `Voce e um especialista em fitossanidade e entomologia agricola brasileira. Analise a imagem enviada e identifique pragas, doencas ou condicoes da planta.

IMPORTANTE: Responda EXCLUSIVAMENTE em portugues brasileiro. Nunca responda em ingles.

Responda APENAS com um JSON valido (sem markdown, sem backticks, sem texto extra) no seguinte formato:

{
  "pest_id": "identificador_da_praga_ou_doenca",
  "pest_name": "Nome popular em portugues",
  "confidence": 0.85,
  "message": "Resumo curto do diagnostico",
  "crop": "cultura_identificada",
  "crop_confidence": 0.9,
  "predictions": [
    {
      "id": "identificador",
      "confidence": 0.85,
      "common_name": "Nome popular",
      "scientific_name": "Nome cientifico",
      "category": "pest|disease|deficiency|healthy",
      "type": "insect|fungus|bacteria|virus|nematode|deficiency|healthy"
    }
  ],
  "enrichment": {
    "name_pt": "Nome em portugues",
    "description": "Descricao detalhada da praga/doenca, ciclo de vida, como afeta a cultura",
    "causes": ["Causa 1", "Causa 2"],
    "symptoms": ["Sintoma 1 visivel", "Sintoma 2"],
    "chemical_treatment": ["Produto/principio ativo 1 com dosagem", "Produto 2"],
    "biological_treatment": ["Controle biologico 1", "Controle biologico 2"],
    "cultural_treatment": ["Pratica cultural 1", "Pratica cultural 2"],
    "prevention": ["Medida preventiva 1", "Medida preventiva 2"],
    "severity": "critical|high|medium|low|none",
    "lifecycle": "Descricao do ciclo de vida da praga",
    "economic_impact": "Impacto economico na producao",
    "monitoring": ["Como monitorar 1", "Como monitorar 2"],
    "favorable_conditions": ["Condicao favoravel 1", "Condicao 2"],
    "resistance_info": "Informacoes sobre resistencia",
    "recommended_products": [
      {
        "name": "Nome do produto",
        "active_ingredient": "Principio ativo",
        "dosage": "Dosagem recomendada",
        "interval": "Intervalo de aplicacao",
        "safety_period": "Periodo de carencia",
        "toxic_class": "Classe toxicologica"
      }
    ],
    "related_pests": ["Praga relacionada 1"],
    "action_threshold": "Nivel de acao/controle",
    "mip_strategy": "Estrategia de Manejo Integrado de Pragas recomendada"
  }
}

Regras:
- Se a planta estiver saudavel, use pest_id "Healthy" e severity "none"
- Confidence deve ser um numero entre 0 e 1
- Todos os textos DEVEM estar em portugues brasileiro
- Seja especifico para a realidade agricola brasileira (produtos registrados no MAPA, praticas locais)
- Inclua SEMPRE recomendacoes de MIP (Manejo Integrado de Pragas)
- Para tratamentos quimicos, mencione que e necessario receituario agronomico
- Se nao conseguir identificar com certeza, indique baixa confianca e possibilidades`;

interface DiagnosisRequest {
  image_base64: string;
  crop_type: string;
  latitude: number | null;
  longitude: number | null;
}

serve(async (req: Request) => {
  const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",");
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : (ALLOWED_ORIGINS[0] ?? "");

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Token de autenticacao ausente" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token invalido" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Rate limiting ──
  if (!checkRateLimit(user.id)) {
    return new Response(
      JSON.stringify({ error: "Muitas requisições. Aguarde um momento." }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Subscription enforcement ──────────────────────────────────
  const PLAN_LIMITS: Record<string, number> = {
    free: 3,
    pro: 30,
    enterprise: -1,
  };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const plan =
    (subscription?.status === "active" && subscription?.plan) || "free";
  const limit = PLAN_LIMITS[plan] ?? 3;

  if (limit !== -1) {
    // Count diagnoses created this month
    const now = new Date();
    const firstOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    const { count: usedThisMonth, error: countError } = await supabase
      .from("pragas_diagnoses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", firstOfMonth);

    if (countError) {
      console.error("Count query error:", countError);
    }

    const used = usedThisMonth ?? 0;

    if (used >= limit) {
      return new Response(
        JSON.stringify({
          error: "Limite de diagnosticos atingido",
          limit,
          used,
          plan,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }
  // ── End subscription enforcement ──────────────────────────────

  try {
    const body: DiagnosisRequest = await req.json();
    const { image_base64, crop_type, latitude, longitude } = body;

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "Imagem nao fornecida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!CLAUDE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API de diagnostico nao configurada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Clean base64 (remove data URI prefix if present)
    const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, "");

    // Detect media type
    const isJpeg =
      cleanBase64.startsWith("/9j/") || cleanBase64.startsWith("/9J/");
    const isPng = cleanBase64.startsWith("iVBOR");
    const mediaType = isPng
      ? "image/png"
      : isJpeg
        ? "image/jpeg"
        : "image/jpeg";

    // Build the prompt with crop context
    const cropContext = crop_type
      ? `\nA cultura informada pelo produtor e: ${crop_type}. Considere isso na sua analise.`
      : "";
    const locationContext =
      latitude && longitude
        ? `\nLocalizacao aproximada: lat ${latitude.toFixed(2)}, lng ${longitude.toFixed(2)} (Brasil).`
        : "";

    const userPrompt = `Analise esta imagem de uma planta/lavoura e faca o diagnostico fitossanitario completo.${cropContext}${locationContext}\n\nRetorne APENAS o JSON conforme o formato especificado, sem nenhum texto adicional.`;

    // Call Claude Vision API
    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: cleanBase64,
                  },
                },
                {
                  type: "text",
                  text: userPrompt,
                },
              ],
            },
          ],
        }),
      },
    );

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", errText);
      return new Response(
        JSON.stringify({
          error: "Erro na analise da imagem. Tente novamente.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const claudeData = await claudeResponse.json();

    // Extract text from Claude response
    const rawText = claudeData?.content?.[0]?.text;
    if (!rawText) {
      return new Response(
        JSON.stringify({
          error: "Resposta vazia da IA. Tente com outra imagem.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse JSON from response (handle possible markdown code blocks)
    let diagnosisData: Record<string, unknown>;
    try {
      const jsonStr = rawText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      diagnosisData = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse Claude response:", rawText);
      return new Response(
        JSON.stringify({
          error: "Erro ao processar resultado. Tente novamente.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build the notes JSON (matches AgrioNotesData format)
    const notes = {
      message: diagnosisData.message || "Diagnostico concluido",
      crop: diagnosisData.crop || crop_type,
      crop_confidence: diagnosisData.crop_confidence || 0.8,
      predictions: diagnosisData.predictions || [],
      enrichment: diagnosisData.enrichment || {},
    };

    // Map crop_type to internal crop ID
    const cropMap: Record<string, string> = {
      Soybean: "soja",
      Corn: "milho",
      Coffee: "cafe",
      Cotton: "algodao",
      Sugarcane: "cana",
      Wheat: "trigo",
      Rice: "arroz",
      Bean: "feijao",
      Potato: "batata",
      Tomato: "tomate",
      Cassava: "mandioca",
      Citrus: "citros",
      Grape: "uva",
      Banana: "banana",
      Sorghum: "sorgo",
      Peanut: "amendoim",
      Sunflower: "girassol",
      Onion: "cebola",
    };
    const cropId = cropMap[crop_type] || crop_type?.toLowerCase() || "outro";

    // Save to database
    const { data: saved, error: dbError } = await supabase
      .from("pragas_diagnoses")
      .insert({
        user_id: user.id,
        crop: cropId,
        pest_id: (diagnosisData.pest_id as string) || null,
        pest_name: (diagnosisData.pest_name as string) || null,
        confidence: (diagnosisData.confidence as number) || 0,
        notes: JSON.stringify(notes),
        location_lat: latitude,
        location_lng: longitude,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar diagnostico" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ...saved,
        parsedNotes: notes,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Diagnosis error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
