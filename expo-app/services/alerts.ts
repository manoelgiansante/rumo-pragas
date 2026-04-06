import type { WeatherData } from './weather';

export type AlertSeverity = 'high' | 'medium' | 'low';

export interface PestAlert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  icon: string;
  cropAffected: string;
  date: string;
  isForecast?: boolean;
}

interface AlertRule {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  icon: string;
  cropAffected: string;
  condition: (weather: WeatherData) => boolean;
}

const ALERT_RULES: AlertRule[] = [
  // HIGH severity
  {
    id: 'ferrugem_alta_umidade',
    title: 'Risco elevado de ferrugem',
    description:
      'Umidade acima de 80% e temperatura acima de 25\u00B0C criam condicoes ideais para ferrugem asiatica. Monitore as folhas inferiores e aplique fungicida preventivo.',
    severity: 'high',
    icon: 'alert-circle',
    cropAffected: 'Soja, Cafe, Trigo',
    condition: (w) => w.humidity > 80 && w.temperature > 25,
  },
  {
    id: 'doencas_fungicas_chuva',
    title: 'Condicoes favoraveis para doencas fungicas',
    description:
      'Chuvas frequentes com temperaturas amenas favorecem o desenvolvimento de fungos como cercospora, antracnose e mancha-alvo. Priorize inspeccao foliar.',
    severity: 'high',
    icon: 'water',
    cropAffected: 'Soja, Milho, Feijao',
    condition: (w) => w.rain > 5 && w.temperature > 22 && w.humidity > 75,
  },
  {
    id: 'mofo_branco',
    title: 'Alerta de mofo branco (Sclerotinia)',
    description:
      'Umidade persistente acima de 85% com temperaturas entre 15-25\u00B0C favorece a esclerotinia. Verifique areas com sombreamento e alta densidade de plantio.',
    severity: 'high',
    icon: 'snow',
    cropAffected: 'Soja, Feijao, Girassol',
    condition: (w) => w.humidity > 85 && w.temperature >= 15 && w.temperature <= 25,
  },

  // MEDIUM severity
  {
    id: 'acaros_calor_seco',
    title: 'Risco de acaros e tripes',
    description:
      'Tempo quente e seco favorece a proliferacao de acaros e tripes. Observe a face inferior das folhas para sinais de ataque.',
    severity: 'medium',
    icon: 'bug',
    cropAffected: 'Soja, Algodao, Citros',
    condition: (w) => w.temperature > 30 && w.humidity < 50,
  },
  {
    id: 'cigarrinha_milho',
    title: 'Condicoes favoraveis para cigarrinha',
    description:
      'Temperaturas entre 25-32\u00B0C com periodos secos favorecem a cigarrinha-do-milho, vetor do complexo de enfezamentos. Avalie a necessidade de controle.',
    severity: 'medium',
    icon: 'bug',
    cropAffected: 'Milho',
    condition: (w) => w.temperature >= 25 && w.temperature <= 32 && w.humidity < 65 && w.rain < 2,
  },
  {
    id: 'lagarta_umidade_moderada',
    title: 'Atencao com lagartas desfolhadoras',
    description:
      'Condicoes climaticas moderadas com umidade entre 60-80% e temperatura amena podem favorecer oviposicao de lagartas. Monitorar periodicamente.',
    severity: 'medium',
    icon: 'leaf',
    cropAffected: 'Soja, Milho, Algodao',
    condition: (w) =>
      w.humidity >= 60 && w.humidity <= 80 && w.temperature >= 22 && w.temperature <= 32,
  },
  {
    id: 'percevejos_graos',
    title: 'Periodo de risco para percevejos',
    description:
      'Temperaturas acima de 28\u00B0C com baixa precipitacao aumentam a atividade de percevejos sugadores. Verifique os graos e vagens.',
    severity: 'medium',
    icon: 'shield',
    cropAffected: 'Soja, Milho',
    condition: (w) => w.temperature > 28 && w.dailyPrecipitationSum < 3,
  },

  // LOW severity
  {
    id: 'vento_dispersao',
    title: 'Ventos podem dispersar pragas',
    description:
      'Ventos acima de 25 km/h podem transportar esporos de fungos e insetos adultos para novas areas. Observe bordaduras e areas expostas.',
    severity: 'low',
    icon: 'leaf',
    cropAffected: 'Todas as culturas',
    condition: (w) => w.windSpeed > 25,
  },
  {
    id: 'geada_estresse',
    title: 'Baixas temperaturas e estresse da planta',
    description:
      'Temperaturas abaixo de 10\u00B0C enfraquecem as plantas, tornando-as mais suscetíveis a patogenos oportunistas apos a recuperacao.',
    severity: 'low',
    icon: 'thermometer',
    cropAffected: 'Cafe, Citros, Hortalicas',
    condition: (w) => w.temperature < 10,
  },
  {
    id: 'condicoes_favoraveis_geral',
    title: 'Condicoes estaveis - bom momento para monitorar',
    description:
      'O clima atual esta estavel. Aproveite para realizar inspeccoes de rotina e avaliar o NDE (Nivel de Dano Economico) de pragas presentes.',
    severity: 'low',
    icon: 'checkmark-circle',
    cropAffected: 'Todas as culturas',
    condition: (w) =>
      w.temperature >= 18 &&
      w.temperature <= 28 &&
      w.humidity >= 40 &&
      w.humidity <= 70 &&
      w.rain < 1,
  },
];

/**
 * Generates forecast-based pest alerts by analyzing the 7-day daily forecast.
 * Looks for multi-day weather patterns that indicate pest/disease risks.
 */
export function generateForecastAlerts(weather: WeatherData): PestAlert[] {
  const forecast = weather.forecast;
  if (!forecast || forecast.length === 0) return [];

  const now = new Date().toISOString();
  const alerts: PestAlert[] = [];

  // Rule A: 3+ consecutive days with precipitation > 5mm AND temp > 22C
  // → Prolonged fungal disease risk
  let consecutiveWetWarm = 0;
  for (const day of forecast) {
    if (day.precipitationSum > 5 && day.temperatureMax > 22) {
      consecutiveWetWarm++;
      if (consecutiveWetWarm >= 3) {
        alerts.push({
          id: 'forecast_doencas_fungicas_prolongado',
          title: 'Risco prolongado de doencas fungicas nos proximos dias',
          description:
            'A previsao indica 3 ou mais dias consecutivos com chuvas acima de 5mm e temperaturas acima de 22\u00B0C. Estas condicoes favorecem fortemente o desenvolvimento de doencas fungicas como ferrugem, cercospora e antracnose. Antecipe aplicacoes preventivas de fungicida.',
          severity: 'high',
          icon: 'water',
          cropAffected: 'Soja, Milho, Feijao, Cafe',
          date: now,
          isForecast: true,
        });
        break;
      }
    } else {
      consecutiveWetWarm = 0;
    }
  }

  // Rule B: Any day with min temp < 5C → Frost alert
  const frostDay = forecast.find((day) => day.temperatureMin < 5);
  if (frostDay) {
    alerts.push({
      id: 'forecast_geada',
      title: 'Alerta de geada nos proximos dias',
      description: `Previsao de temperatura minima abaixo de 5\u00B0C no dia ${frostDay.date}. Geadas podem causar danos severos em culturas sensiveis. Considere medidas de protecao como irrigacao por aspersao ou cobertura de mudas.`,
      severity: 'high',
      icon: 'snow',
      cropAffected: 'Cafe, Citros, Hortalicas, Banana',
      date: now,
      isForecast: true,
    });
  }

  // Rule C: 3+ days with zero precipitation AND temp > 30C
  // → Prolonged dry period - mite/thrips risk
  let consecutiveDryHot = 0;
  for (const day of forecast) {
    if (day.precipitationSum === 0 && day.temperatureMax > 30) {
      consecutiveDryHot++;
      if (consecutiveDryHot >= 3) {
        alerts.push({
          id: 'forecast_seco_acaros',
          title: 'Periodo seco prolongado - monitore acaros e tripes',
          description:
            'A previsao indica 3 ou mais dias sem chuva com temperaturas acima de 30\u00B0C. Condicoes de seca prolongada favorecem a proliferacao de acaros e tripes. Intensifique o monitoramento da face inferior das folhas.',
          severity: 'medium',
          icon: 'bug',
          cropAffected: 'Soja, Algodao, Citros, Milho',
          date: now,
          isForecast: true,
        });
        break;
      }
    } else {
      consecutiveDryHot = 0;
    }
  }

  return alerts;
}

/**
 * Generates pest alerts based on current weather conditions AND the 7-day forecast.
 * Evaluates all rules against the weather data and returns matching alerts
 * sorted by severity (high first).
 * Deduplicates by alert id, keeping the higher severity one.
 */
export function generateAlerts(weather: WeatherData): PestAlert[] {
  const now = new Date().toISOString();
  const severityOrder: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };

  // Current-conditions alerts
  const currentAlerts: PestAlert[] = ALERT_RULES.filter((rule) => rule.condition(weather)).map(
    (rule) => ({
      id: rule.id,
      title: rule.title,
      description: rule.description,
      severity: rule.severity,
      icon: rule.icon,
      cropAffected: rule.cropAffected,
      date: now,
    }),
  );

  // Forecast-based alerts
  const forecastAlerts = generateForecastAlerts(weather);

  // Merge and deduplicate by id (keep highest severity)
  const alertMap = new Map<string, PestAlert>();

  for (const alert of [...currentAlerts, ...forecastAlerts]) {
    const existing = alertMap.get(alert.id);
    if (!existing || severityOrder[alert.severity] < severityOrder[existing.severity]) {
      alertMap.set(alert.id, alert);
    }
  }

  const merged = Array.from(alertMap.values());

  // Sort: high > medium > low
  merged.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return merged;
}
