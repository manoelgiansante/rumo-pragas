import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme } from '../src/utils/theme';

const { width } = Dimensions.get('window');

interface OnboardingPage {
  icon: string;
  title: string;
  subtitle: string;
  features: { icon: string; text: string }[];
  colors: string[];
}

const pages: OnboardingPage[] = [
  {
    icon: 'camera-outline',
    title: 'Diagnóstico com IA',
    subtitle: 'Tire uma foto da praga ou sintoma e receba identificação instantânea com inteligência artificial',
    features: [
      { icon: 'lightning-bolt', text: 'Resultado em segundos' },
      { icon: 'check-decagram', text: 'Alta precisão de identificação' },
      { icon: 'leaf', text: 'Tratamentos personalizados' },
    ],
    colors: ['#0F6B4D', '#1F9E6E'],
  },
  {
    icon: 'clipboard-list',
    title: 'Histórico Completo',
    subtitle: 'Acompanhe todas as suas análises em um só lugar, com filtros e busca inteligente',
    features: [
      { icon: 'history', text: 'Timeline de diagnósticos' },
      { icon: 'magnify', text: 'Busca por praga ou cultura' },
      { icon: 'star', text: 'Favoritos para acesso rápido' },
    ],
    colors: ['#2461D1', '#3882F2'],
  },
  {
    icon: 'bookshelf',
    title: 'Biblioteca de Pragas',
    subtitle: 'Acesse informações detalhadas sobre pragas das principais culturas do Brasil',
    features: [
      { icon: 'leaf', text: 'Soja, Milho, Café, Algodão e mais' },
      { icon: 'information', text: 'Sintomas e ciclo de vida' },
      { icon: 'flask', text: 'Controle cultural, químico e biológico' },
    ],
    colors: ['#C78F19', '#EBB026'],
  },
  {
    icon: 'shield-check',
    title: 'Proteja sua Lavoura',
    subtitle: 'Tecnologia de ponta para o agronegócio brasileiro — do campo à tomada de decisão',
    features: [
      { icon: 'weather-sunny', text: 'Avaliação de risco climático' },
      { icon: 'chart-bar', text: 'Níveis de severidade detalhados' },
      { icon: 'bell-badge', text: 'Alertas e prevenção' },
    ],
    colors: ['#147A59', '#29B887'],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1 });
      setCurrentPage(currentPage + 1);
    }
  };

  const handleFinish = () => {
    router.replace('/auth');
  };

  const renderPage = ({ item }: { item: OnboardingPage }) => (
    <View style={[styles.page, { backgroundColor: item.colors[0] }]}>
      <View style={styles.iconSection}>
        <View style={[styles.iconRing, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={[styles.iconRingInner, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <MaterialCommunityIcons name={item.icon as any} size={42} color="#fff" />
          </View>
        </View>
      </View>

      <Text style={styles.pageTitle}>{item.title}</Text>
      <Text style={styles.pageSubtitle}>{item.subtitle}</Text>

      <View style={styles.featuresContainer}>
        {item.features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIconBg}>
              <MaterialCommunityIcons name={f.icon as any} size={16} color="#fff" />
            </View>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const isLast = currentPage === pages.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={pages}
        renderItem={renderPage}
        keyExtractor={(_, i) => i.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
      />

      <View style={styles.bottomControls}>
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />
          ))}
        </View>

        {isLast ? (
          <TouchableOpacity style={styles.startButton} onPress={handleFinish}>
            <Text style={styles.startButtonText}>Começar Agora</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color={AppTheme.accent} />
          </TouchableOpacity>
        ) : (
          <View style={styles.navRow}>
            <TouchableOpacity onPress={handleFinish}>
              <Text style={styles.skipText}>Pular</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextText}>Próximo</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F6B4D' },
  page: { width, flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  iconSection: { marginBottom: 40 },
  iconRing: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center' },
  iconRingInner: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 14 },
  pageSubtitle: { fontSize: 16, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 24, marginBottom: 36 },
  featuresContainer: { width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 12 },
  featureIconBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  featureText: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.9)', flex: 1 },
  bottomControls: { position: 'absolute', bottom: 36, left: 24, right: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { width: 24, backgroundColor: '#fff' },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, height: 56, gap: 10 },
  startButtonText: { fontSize: 17, fontWeight: 'bold', color: AppTheme.accent },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipText: { fontSize: 15, color: 'rgba(255,255,255,0.55)' },
  nextButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, gap: 6 },
  nextText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
