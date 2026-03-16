import { DiagnosisResult, AgrioNotesData, ConfidenceLevel, SeverityLevel } from './index';

export function parseDiagnosisNotes(notes?: string): AgrioNotesData | null {
  if (!notes) return null;
  try {
    return JSON.parse(notes);
  } catch {
    return null;
  }
}

export function getDiagnosisDisplayName(d: DiagnosisResult): string {
  const parsed = parseDiagnosisNotes(d.notes);
  return parsed?.enrichment?.name_pt || d.pest_name || d.pest_id || 'Diagnóstico';
}

export function getDiagnosisScientificName(d: DiagnosisResult): string | undefined {
  const parsed = parseDiagnosisNotes(d.notes);
  const predictions = parsed?.predictions || parsed?.id_array || [];
  const top = predictions.find(p => p.id !== 'Healthy') || predictions[0];
  return top?.scientific_name;
}

export function getConfidenceLevel(confidence?: number): ConfidenceLevel {
  if (!confidence) return 'low';
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  if (confidence >= 0.40) return 'low';
  return 'very_low';
}

export function getSeverityLevel(d: DiagnosisResult): SeverityLevel {
  const parsed = parseDiagnosisNotes(d.notes);
  const severity = parsed?.enrichment?.severity;
  if (severity && ['critical', 'high', 'medium', 'low', 'none'].includes(severity)) {
    return severity as SeverityLevel;
  }
  return 'medium';
}

export function isHealthy(d: DiagnosisResult): boolean {
  return d.pest_id === 'Healthy' || d.pest_name === 'Healthy';
}

export function getConfidenceDisplay(level: ConfidenceLevel): { label: string; color: string; range: string } {
  switch (level) {
    case 'high': return { label: 'Alta', color: '#2E8C3D', range: '85%+' };
    case 'medium': return { label: 'Média', color: '#EBB026', range: '60-84%' };
    case 'low': return { label: 'Baixa', color: '#FF9500', range: '40-59%' };
    case 'very_low': return { label: 'Muito Baixa', color: '#FF3B30', range: '<40%' };
  }
}

export function getSeverityDisplay(level: SeverityLevel): { label: string; color: string; icon: string } {
  switch (level) {
    case 'critical': return { label: 'Crítico', color: '#FF3B30', icon: 'alert' };
    case 'high': return { label: 'Alto', color: '#FF9500', icon: 'alert-circle' };
    case 'medium': return { label: 'Médio', color: '#EBB026', icon: 'information' };
    case 'low': return { label: 'Baixo', color: '#2E8C3D', icon: 'check-circle' };
    case 'none': return { label: 'Nenhum', color: '#8E8E93', icon: 'minus-circle' };
  }
}

export function getSubscriptionPlan(plan: 'free' | 'basico' | 'pro') {
  const plans = {
    free: {
      displayName: 'Gratuito',
      price: 'R$ 0',
      diagnosisLimit: 3,
      features: ['3 diagnósticos/mês', 'Biblioteca de pragas', 'Mapa de surtos (visualizar)'],
    },
    basico: {
      displayName: 'Básico',
      price: 'R$ 29/mês',
      diagnosisLimit: 10,
      features: ['10 diagnósticos/mês', 'Chat IA (30 msgs/dia)', 'Previsão de risco', 'MIP básico', 'Comunidade completa', 'Histórico 90 dias'],
    },
    pro: {
      displayName: 'Pro',
      price: 'R$ 69/mês',
      diagnosisLimit: 50,
      features: ['50 diagnósticos/mês', 'Chat IA ilimitado', 'Previsão de risco', 'MIP avançado', 'Comunidade completa', 'Histórico ilimitado', 'Relatórios PDF', 'Suporte prioritário'],
    },
  };
  return plans[plan];
}

export function mapCropName(crop: string): string | undefined {
  const map: Record<string, string> = {
    soybean: 'soja', soja: 'soja',
    corn: 'milho', milho: 'milho',
    coffee: 'cafe', cafe: 'cafe', café: 'cafe',
    cotton: 'algodao', algodao: 'algodao', algodão: 'algodao',
    sugarcane: 'cana', cana: 'cana',
    wheat: 'trigo', trigo: 'trigo',
    rice: 'arroz', arroz: 'arroz',
    bean: 'feijao', feijao: 'feijao', feijão: 'feijao',
    potato: 'batata', batata: 'batata',
    tomato: 'tomate', tomate: 'tomate',
    cassava: 'mandioca', mandioca: 'mandioca',
    citrus: 'citros', citros: 'citros',
    grape: 'uva', uva: 'uva',
    banana: 'banana',
    sorghum: 'sorgo', sorgo: 'sorgo',
    peanut: 'amendoim', amendoim: 'amendoim',
    sunflower: 'girassol', girassol: 'girassol',
    onion: 'cebola', cebola: 'cebola',
  };
  return map[crop.toLowerCase()];
}
