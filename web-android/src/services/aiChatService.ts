import { Config } from '../utils/config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatAPIResponse {
  text: string;
}

interface ChatAPIResponseAlt {
  messages: {
    role: string;
    parts: {
      type: string;
      text?: string;
    }[];
  }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const AIChatService = {
  async sendMessage(
    messages: { role: string; content: string }[],
    token?: string,
  ): Promise<string> {
    const endpoint = `${Config.toolkitURL}/agent/chat`;

    const systemMessage = {
      role: 'system',
      content:
        'Você é o Agro IA, assistente especializado em pragas agrícolas e manejo integrado de pragas (MIP) do app Rumo Pragas. ' +
        'Você ajuda produtores rurais, agrônomos e técnicos agrícolas brasileiros. ' +
        'Responda sempre em português brasileiro, de forma clara e prática. ' +
        'Suas especialidades: identificação de pragas, doenças de plantas, recomendações de manejo (cultural, convencional e orgânico), ' +
        'prevenção, monitoramento, condições climáticas favoráveis a pragas, e boas práticas agrícolas. ' +
        'Seja direto, use linguagem acessível e, quando relevante, sugira o diagnóstico por foto do app. ' +
        'Culturas principais: soja, milho, café, algodão, cana-de-açúcar e trigo.',
    };

    const allMessages = [systemMessage, ...messages];
    const payload = { messages: allMessages };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error('Erro ao se comunicar com a IA');
    }

    if (!res.ok) {
      throw new Error('Erro ao se comunicar com a IA');
    }

    const raw = await res.text();

    // Try ChatAPIResponse format: { text: "..." }
    try {
      const result: ChatAPIResponse = JSON.parse(raw);
      if (result.text) return result.text;
    } catch {
      // not this format
    }

    // Try ChatAPIResponseAlt format: { messages: [{ parts: [{ type, text }] }] }
    try {
      const result: ChatAPIResponseAlt = JSON.parse(raw);
      if (result.messages) {
        for (const msg of result.messages) {
          for (const part of msg.parts) {
            if (part.type === 'text' && part.text) {
              return part.text;
            }
          }
        }
      }
    } catch {
      // not this format either
    }

    // Fall back to raw text
    if (raw && raw.length > 0) {
      return raw;
    }

    throw new Error('Erro ao processar resposta');
  },
};
