-- =====================================================
-- Rumo Pragas IA - Schema Supabase
-- Execute no SQL Editor do Supabase Dashboard
-- =====================================================

-- Tabela de diagnosticos
CREATE TABLE IF NOT EXISTS pragas_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  pest_id TEXT,
  pest_name TEXT,
  confidence DOUBLE PRECISION,
  image_url TEXT,
  notes TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de perfis
CREATE TABLE IF NOT EXISTS pragas_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT DEFAULT 'produtor',
  city TEXT,
  state TEXT,
  crops TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de assinaturas (multi-plataforma)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  provider TEXT NOT NULL DEFAULT 'free' CHECK (provider IN ('free', 'apple', 'google', 'stripe')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  apple_transaction_id TEXT,
  google_purchase_token TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================================================
-- INDEXES para performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_diagnoses_user_id ON pragas_diagnoses(user_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_user_created ON pragas_diagnoses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnoses_crop ON pragas_diagnoses(crop);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON pragas_profiles(id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE pragas_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pragas_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Diagnosticos: usuarios so veem/editam os seus
CREATE POLICY "Users can view own diagnoses"
  ON pragas_diagnoses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own diagnoses"
  ON pragas_diagnoses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own diagnoses"
  ON pragas_diagnoses FOR DELETE
  USING (auth.uid() = user_id);

-- Perfis: usuarios so veem/editam o seu
CREATE POLICY "Users can view own profile"
  ON pragas_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON pragas_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON pragas_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Assinaturas: usuarios so veem a sua
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Assinaturas: apenas service_role pode inserir/atualizar (via Edge Functions/webhooks)
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Trigger para criar perfil automaticamente apos signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.pragas_profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status, provider)
  VALUES (NEW.id, 'free', 'active', 'free')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Funcao para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON pragas_profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON pragas_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
