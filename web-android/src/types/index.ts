export interface DiagnosisResult {
  id: string;
  user_id: string;
  crop: string;
  pest_id?: string;
  pest_name?: string;
  confidence?: number;
  image_url?: string;
  notes?: string;
  location_lat?: number;
  location_lng?: number;
  location_name?: string;
  created_at: string;
}

export interface AgrioNotesData {
  message?: string;
  crop?: string;
  crop_confidence?: number;
  id_array?: AgrioPrediction[];
  predictions?: AgrioPrediction[];
  enrichment?: AgrioEnrichment;
}

export interface AgrioPrediction {
  id: string;
  confidence: number;
  common_name?: string;
  scientific_name?: string;
  category?: string;
  type?: string;
}

export interface AgrioEnrichment {
  name_pt?: string;
  name_es?: string;
  description?: string;
  description_es?: string;
  causes?: string[];
  causes_es?: string[];
  symptoms?: string[];
  symptoms_es?: string[];
  chemical_treatment?: string[];
  chemical_treatment_es?: string[];
  biological_treatment?: string[];
  biological_treatment_es?: string[];
  cultural_treatment?: string[];
  cultural_treatment_es?: string[];
  prevention?: string[];
  prevention_es?: string[];
  severity?: string;
  lifecycle?: string;
  economic_impact?: string;
  monitoring?: string[];
  favorable_conditions?: string[];
  resistance_info?: string;
  recommended_products?: AgrioProduct[];
  related_pests?: string[];
  action_threshold?: string;
  mip_strategy?: string;
}

export interface AgrioProduct {
  name: string;
  active_ingredient?: string;
  dosage?: string;
  interval?: string;
  safety_period?: string;
  toxic_class?: string;
}

export interface UserProfile {
  id: string;
  full_name?: string;
  email?: string;
  city?: string;
  state?: string;
  role: string;
  crops: string[];
  language: string;
  dark_mode: boolean;
  push_enabled: boolean;
  onboarding_done: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  dailyPrecipitation: number;
  windSpeed: number;
  description: string;
  icon: string;
  location: string;
}

export interface Pest {
  id: string;
  namePt: string;
  nameEs: string;
  scientificName: string;
  crop: string;
  category: string;
  description: string;
  symptoms: string[];
  lifecycle: string;
  treatmentCultural: string;
  treatmentConventional: string;
  treatmentOrganic: string;
  prevention: string;
  imageURL?: string;
  severity: SeverityLevel;
  isNotifiable: boolean;
}

export type CropTypeKey = 'soja' | 'milho' | 'cafe' | 'algodao' | 'cana' | 'trigo' | 'arroz' | 'feijao' | 'batata' | 'tomate' | 'mandioca' | 'citros' | 'uva' | 'banana' | 'sorgo' | 'amendoim' | 'girassol' | 'cebola';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'very_low';
export type SubscriptionPlanType = 'free' | 'basico' | 'pro';

export interface AuthResponse {
  access_token?: string;
  token_type?: string;
  refresh_token?: string;
  user?: SupabaseUser;
}

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
}
