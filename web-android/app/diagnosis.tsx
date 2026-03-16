import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { SupabaseService } from '../src/services/supabaseService';
import { AppTheme } from '../src/utils/theme';
import { CROPS, CropInfo } from '../src/types/cropData';
import {
  DiagnosisResult,
  AgrioNotesData,
  AgrioEnrichment,
  AgrioProduct,
} from '../src/types';
import * as helpers from '../src/types/helpers';
import { useHeaderPadding } from '../src/utils/useHeaderPadding';

// ─── Types ──────────────────────────────────────────────────────────────────

type FlowStep = 'photoSelection' | 'cropSelection' | 'analyzing' | 'result' | 'error';

// ─── Constants ──────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_MESSAGES = [
  'Preparando imagem...',
  'Enviando para an\u00e1lise...',
  'Identificando praga...',
  'Processando resultado...',
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DiagnosisScreen() {
  const router = useRouter();
  const { accessToken, currentUser } = useAuth();
  const headerPadding = useHeaderPadding();

  const [flowStep, setFlowStep] = useState<FlowStep>('photoSelection');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<CropInfo>(CROPS[0]);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES[0]);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['description', 'symptoms'])
  );
  const [cropSearch, setCropSearch] = useState('');

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // ─── Image Processing ───────────────────────────────────────────────────

  const processImage = async (uri: string): Promise<{ uri: string; base64: string }> => {
    // Get image info to determine resize dimensions
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    // Check size and re-compress if needed (target max ~800KB)
    if (manipulated.base64) {
      const sizeBytes = (manipulated.base64.length * 3) / 4;
      if (sizeBytes > 800 * 1024) {
        const recompressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 960 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        return { uri: recompressed.uri, base64: recompressed.base64! };
      }
    }

    return { uri: manipulated.uri, base64: manipulated.base64! };
  };

  // ─── Image Selection ────────────────────────────────────────────────────

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const processed = await processImage(result.assets[0].uri);
      setImageUri(processed.uri);
      setImageBase64(processed.base64);
      setFlowStep('cropSelection');
    }
  };

  const handlePickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const processed = await processImage(result.assets[0].uri);
      setImageUri(processed.uri);
      setImageBase64(processed.base64);
      setFlowStep('cropSelection');
    }
  };

  // ─── Diagnosis ──────────────────────────────────────────────────────────

  const startDiagnosis = async () => {
    if (!accessToken) {
      setErrorMessage('Sessão expirada. Faça login novamente.');
      setFlowStep('error');
      return;
    }
    if (!imageBase64) return;

    setFlowStep('analyzing');
    setProgress(0);
    setStatusMessage(STATUS_MESSAGES[0]);

    // Start animations
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Progress simulation
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += 0.02;
      if (currentProgress >= 0.9) {
        clearInterval(progressInterval);
      }
      setProgress(Math.min(currentProgress, 0.9));

      if (currentProgress < 0.25) setStatusMessage(STATUS_MESSAGES[0]);
      else if (currentProgress < 0.5) setStatusMessage(STATUS_MESSAGES[1]);
      else if (currentProgress < 0.75) setStatusMessage(STATUS_MESSAGES[2]);
      else setStatusMessage(STATUS_MESSAGES[3]);
    }, 200);

    try {
      // Get location
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = loc.coords.latitude;
          longitude = loc.coords.longitude;
        }
      } catch {}

      const response = await SupabaseService.callEdgeFunction(
        'diagnose',
        {
          crop_type: selectedCrop.apiName,
          image_base64: imageBase64,
          latitude,
          longitude,
        },
        accessToken
      );

      clearInterval(progressInterval);
      setProgress(1);
      setStatusMessage('Salvando resultado...');

      // The edge function may return the full DiagnosisResult already saved,
      // or we may need to persist it ourselves.
      let result: DiagnosisResult = response;

      // If the response doesn't have an id (not saved by edge function), persist it
      if (!result.id && currentUser?.id && accessToken) {
        try {
          const parsed = typeof response === 'string' ? JSON.parse(response) : response;
          const topPrediction = parsed?.predictions?.[0] || parsed?.id_array?.[0];
          result = await SupabaseService.saveDiagnosis(accessToken, {
            user_id: currentUser.id,
            crop: selectedCrop.apiName,
            pest_id: topPrediction?.id || null,
            pest_name: parsed?.enrichment?.name_pt || topPrediction?.common_name || null,
            confidence: topPrediction?.confidence || null,
            notes: JSON.stringify(parsed),
            location_lat: latitude || null,
            location_lng: longitude || null,
          });
        } catch {
          // If save fails, still show the result - just won't appear in history
          result = {
            id: Date.now().toString(),
            user_id: currentUser.id,
            crop: selectedCrop.apiName,
            notes: JSON.stringify(response),
            created_at: new Date().toISOString(),
            ...response,
          };
        }
      }

      setDiagnosisResult(result);

      setTimeout(() => {
        setFlowStep('result');
      }, 500);
    } catch (err: any) {
      clearInterval(progressInterval);
      setErrorMessage(err.message || 'Erro desconhecido ao realizar diagn\u00f3stico');
      setFlowStep('error');
    }
  };

  // ─── Navigation ─────────────────────────────────────────────────────────

  const handleBack = () => {
    if (flowStep === 'cropSelection') {
      setImageUri(null);
      setImageBase64(null);
      setFlowStep('photoSelection');
    } else {
      router.back();
    }
  };

  const handleClose = () => {
    router.back();
  };

  const resetFlow = () => {
    setImageUri(null);
    setImageBase64(null);
    setDiagnosisResult(null);
    setErrorMessage('');
    setProgress(0);
    setFlowStep('photoSelection');
  };

  // ─── Section Toggle ─────────────────────────────────────────────────────

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Toolbar Title ──────────────────────────────────────────────────────

  const getToolbarTitle = (): string => {
    switch (flowStep) {
      case 'photoSelection': return 'Diagnosticar Praga';
      case 'cropSelection': return 'Selecionar Cultura';
      case 'analyzing': return 'Analisando...';
      case 'result': return 'Resultado';
      case 'error': return 'Diagn\u00f3stico';
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerPadding }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={flowStep === 'cropSelection' ? handleBack : handleClose}
        >
          <MaterialCommunityIcons
            name={flowStep === 'cropSelection' ? 'chevron-left' : 'close'}
            size={20}
            color={AppTheme.text}
          />
        </TouchableOpacity>

        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons
            name="camera-iris"
            size={18}
            color={AppTheme.accent}
          />
          <Text style={styles.headerTitle}>{getToolbarTitle()}</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {/* Flow Steps */}
      {flowStep === 'photoSelection' && renderPhotoSelection()}
      {flowStep === 'cropSelection' && renderCropSelection()}
      {flowStep === 'analyzing' && renderAnalyzing()}
      {flowStep === 'result' && renderResult()}
      {flowStep === 'error' && renderError()}
    </View>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1 - Photo Selection
  // ═══════════════════════════════════════════════════════════════════════

  function renderPhotoSelection() {
    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Camera Icon with Radial Gradient */}
        <Animated.View
          style={[
            styles.cameraIconContainer,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View style={styles.radialOuter}>
            <View style={styles.radialRing} />
            <MaterialCommunityIcons
              name="camera-iris"
              size={48}
              color={AppTheme.accent}
            />
          </View>
        </Animated.View>

        {/* Title & Description */}
        <Animated.View
          style={[
            styles.titleSection,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.mainTitle}>Identifica\u00e7\u00e3o por IA</Text>
          <Text style={styles.mainDescription}>
            Tire uma foto ou escolha da galeria para identificar pragas e doen\u00e7as na sua lavoura
          </Text>
        </Animated.View>

        {/* Action Cards */}
        <Animated.View
          style={[
            styles.actionsContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Take Photo Card */}
          <TouchableOpacity style={styles.actionCard} onPress={handleTakePhoto} activeOpacity={0.7}>
            <View style={[styles.actionIconBox, { backgroundColor: AppTheme.accent }]}>
              <MaterialCommunityIcons name="camera" size={26} color="#FFFFFF" />
            </View>
            <View style={styles.actionTextColumn}>
              <Text style={styles.actionTitle}>Tirar Foto</Text>
              <Text style={styles.actionSubtitle}>Use a c\u00e2mera para capturar a praga</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={AppTheme.textTertiary} />
          </TouchableOpacity>

          {/* Pick from Gallery Card */}
          <TouchableOpacity style={styles.actionCard} onPress={handlePickFromGallery} activeOpacity={0.7}>
            <View style={[styles.actionIconBox, { backgroundColor: AppTheme.techBlue }]}>
              <MaterialCommunityIcons name="image-multiple" size={26} color="#FFFFFF" />
            </View>
            <View style={styles.actionTextColumn}>
              <Text style={styles.actionTitle}>Escolher da Galeria</Text>
              <Text style={styles.actionSubtitle}>Selecione uma foto existente</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={AppTheme.textTertiary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Tips Section */}
        <Animated.View
          style={[
            styles.tipsContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.tipsHeader}>
            <MaterialCommunityIcons name="lightbulb-on" size={18} color={AppTheme.warmAmber} />
            <Text style={styles.tipsHeaderText}>Dicas para melhor resultado</Text>
          </View>

          <View style={styles.tipsCard}>
            {renderTipRow('white-balance-sunny', '#F5C518', 'Boa ilumina\u00e7\u00e3o natural')}
            {renderTipRow('arrow-expand-all', '#00BCD4', 'Foco na \u00e1rea afetada, bem de perto')}
            {renderTipRow('leaf', AppTheme.accent, 'Inclua folhas, caule ou fruto vis\u00edveis')}
            {renderTipRow('image-filter-hdr', AppTheme.techIndigo, 'Imagem n\u00edtida sem tremor')}
          </View>
        </Animated.View>
      </ScrollView>
    );
  }

  function renderTipRow(icon: string, color: string, text: string) {
    return (
      <View style={styles.tipRow} key={text}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} style={{ width: 24 }} />
        <Text style={styles.tipText}>{text}</Text>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2 - Crop Selection
  // ═══════════════════════════════════════════════════════════════════════

  function renderCropSelection() {
    const filteredCrops = cropSearch
      ? CROPS.filter((c) =>
          c.displayName.toLowerCase().includes(cropSearch.toLowerCase())
        )
      : CROPS;

    return (
      <View style={{ flex: 1 }}>
        {/* Image Preview */}
        {imageUri && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: imageUri }} style={styles.imagePreviewThumb} />
            <View style={styles.imagePreviewText}>
              <Text style={styles.imagePreviewTitle}>Imagem selecionada</Text>
              <Text style={styles.imagePreviewSubtitle}>
                Escolha a cultura para melhor precis\u00e3o
              </Text>
            </View>
            <MaterialCommunityIcons
              name="check-circle"
              size={26}
              color={AppTheme.accent}
            />
          </View>
        )}

        {/* Crop Selector Title */}
        <View style={styles.cropSelectorHeader}>
          <MaterialCommunityIcons name="leaf-circle" size={28} color={AppTheme.accent} />
          <Text style={styles.cropSelectorTitle}>Qual cultura est\u00e1 afetada?</Text>
          <Text style={styles.cropSelectorSubtitle}>
            Selecione para melhor precis\u00e3o do diagn\u00f3stico
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={18} color={AppTheme.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar cultura..."
            placeholderTextColor={AppTheme.textSecondary}
            value={cropSearch}
            onChangeText={setCropSearch}
          />
        </View>

        {/* Crop Grid */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.cropGrid}>
          <View style={styles.cropGridInner}>
            {filteredCrops.map((crop) => {
              const isSelected = selectedCrop.key === crop.key;
              return (
                <TouchableOpacity
                  key={crop.key}
                  style={[
                    styles.cropCard,
                    isSelected && {
                      backgroundColor: crop.accentColor + '10',
                      borderColor: crop.accentColor + '80',
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setSelectedCrop(crop)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.cropIconBox,
                      {
                        backgroundColor: isSelected
                          ? crop.accentColor
                          : crop.accentColor + '1F',
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={crop.icon as any}
                      size={24}
                      color={isSelected ? '#FFFFFF' : crop.accentColor}
                    />
                  </View>
                  <Text
                    style={[
                      styles.cropName,
                      isSelected && { color: crop.accentColor, fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {crop.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Start Diagnosis Button */}
        <View style={styles.startButtonContainer}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={startDiagnosis}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="magnify-scan" size={20} color="#FFFFFF" />
            <Text style={styles.startButtonText}>Iniciar Diagn\u00f3stico</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3 - Analyzing
  // ═══════════════════════════════════════════════════════════════════════

  function renderAnalyzing() {
    const spin = rotateAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    const progressPercent = Math.round(progress * 100);

    return (
      <View style={styles.analyzingContainer}>
        <View style={{ flex: 1 }} />

        {/* Pulsing Rings + Progress Circle */}
        <View style={styles.analyzingCenter}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={[
                styles.pulseRing,
                {
                  width: 140 + i * 30,
                  height: 140 + i * 30,
                  borderColor: `rgba(26, 150, 107, ${0.12 - i * 0.03})`,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          ))}

          {/* Background circle track */}
          <View style={styles.progressTrack} />

          {/* Progress arc visual (simplified with border) */}
          <View style={styles.progressCircleWrapper}>
            <View
              style={[
                styles.progressArc,
                {
                  borderTopColor: AppTheme.accent,
                  borderRightColor: progress > 0.25 ? AppTheme.accent : 'transparent',
                  borderBottomColor: progress > 0.5 ? AppTheme.accent : 'transparent',
                  borderLeftColor: progress > 0.75 ? AppTheme.accent : 'transparent',
                  transform: [{ rotate: `${progress * 360 - 90}deg` }],
                },
              ]}
            />
          </View>

          {/* Leaf icon */}
          <View style={styles.leafContainer}>
            <View style={styles.leafGlow} />
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <MaterialCommunityIcons name="leaf" size={32} color={AppTheme.accent} />
            </Animated.View>
          </View>
        </View>

        {/* Status Text */}
        <View style={styles.analyzingStatusSection}>
          <Text style={styles.analyzingStatusText}>{statusMessage}</Text>
          <Text style={styles.analyzingPercent}>{progressPercent}%</Text>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* Footer */}
        <View style={styles.analyzingFooter}>
          <MaterialCommunityIcons name="cpu-64-bit" size={14} color={AppTheme.textTertiary} />
          <Text style={styles.analyzingFooterText}>
            IA especializada em fitossanidade
          </Text>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4 - Result
  // ═══════════════════════════════════════════════════════════════════════

  function renderResult() {
    if (!diagnosisResult) return null;

    const parsed = helpers.parseDiagnosisNotes(diagnosisResult.notes);
    const enrichment = parsed?.enrichment;
    const displayName = helpers.getDiagnosisDisplayName(diagnosisResult);
    const scientificName = helpers.getDiagnosisScientificName(diagnosisResult);
    const isHealthy = helpers.isHealthy(diagnosisResult);
    const severityLevel = helpers.getSeverityLevel(diagnosisResult);
    const severityDisplay = helpers.getSeverityDisplay(severityLevel);
    const confidenceLevel = helpers.getConfidenceLevel(diagnosisResult.confidence);
    const confidenceDisplay = helpers.getConfidenceDisplay(confidenceLevel);
    const confidencePercent = diagnosisResult.confidence
      ? `${Math.round(diagnosisResult.confidence * 100)}%`
      : '—';

    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header with severity gradient */}
        <View
          style={[
            styles.resultHeader,
            {
              backgroundColor: isHealthy
                ? AppTheme.accent
                : severityDisplay.color + '20',
            },
          ]}
        >
          <View style={styles.resultHeaderRow}>
            <View
              style={[
                styles.resultHeaderIcon,
                {
                  backgroundColor: isHealthy
                    ? 'rgba(255,255,255,0.2)'
                    : severityDisplay.color + '25',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={
                  isHealthy
                    ? 'check-circle'
                    : (severityDisplay.icon as any)
                }
                size={28}
                color={isHealthy ? '#FFFFFF' : severityDisplay.color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.resultPestName,
                  isHealthy && { color: '#FFFFFF' },
                ]}
              >
                {isHealthy ? 'Planta Saud\u00e1vel' : displayName}
              </Text>
              {isHealthy ? (
                <Text style={[styles.resultScientific, { color: 'rgba(255,255,255,0.85)' }]}>
                  Nenhuma praga ou doen\u00e7a detectada
                </Text>
              ) : (
                scientificName && (
                  <Text style={styles.resultScientific}>{scientificName}</Text>
                )
              )}
            </View>
          </View>
        </View>

        {/* Badge Row */}
        <View style={styles.badgeRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.badgeRowInner}>
              <View style={[styles.badge, { backgroundColor: severityDisplay.color + '1F' }]}>
                <MaterialCommunityIcons
                  name={severityDisplay.icon as any}
                  size={12}
                  color={severityDisplay.color}
                />
                <Text style={[styles.badgeText, { color: severityDisplay.color }]}>
                  {severityDisplay.label}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: confidenceDisplay.color + '1F' }]}>
                <MaterialCommunityIcons name="chart-bar" size={12} color={confidenceDisplay.color} />
                <Text style={[styles.badgeText, { color: confidenceDisplay.color }]}>
                  Confian\u00e7a: {confidencePercent}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: selectedCrop.accentColor + '1F' }]}>
                <MaterialCommunityIcons
                  name={selectedCrop.icon as any}
                  size={12}
                  color={selectedCrop.accentColor}
                />
                <Text style={[styles.badgeText, { color: selectedCrop.accentColor }]}>
                  {selectedCrop.displayName}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Collapsible Sections */}
        <View style={styles.sectionsContainer}>
          {/* Descricao */}
          {enrichment?.description ? (
            renderCollapsibleSection(
              'description', 'Descri\u00e7\u00e3o', 'text-box', AppTheme.accent,
              <Text style={styles.sectionBodyText}>{enrichment.description}</Text>
            )
          ) : null}

          {/* Sintomas */}
          {enrichment?.symptoms && enrichment.symptoms.length > 0 ? (
            renderCollapsibleSection(
              'symptoms', 'Sintomas', 'eye', AppTheme.coral,
              renderBulletList(enrichment.symptoms)
            )
          ) : null}

          {/* Causas */}
          {enrichment?.causes && enrichment.causes.length > 0 ? (
            renderCollapsibleSection(
              'causes', 'Causas', 'alert', AppTheme.warmAmber,
              renderBulletList(enrichment.causes)
            )
          ) : null}

          {/* Condicoes Favoraveis */}
          {enrichment?.favorable_conditions && enrichment.favorable_conditions.length > 0 ? (
            renderCollapsibleSection(
              'conditions', 'Condi\u00e7\u00f5es Favor\u00e1veis', 'weather-partly-cloudy', '#00BCD4',
              renderBulletList(enrichment.favorable_conditions)
            )
          ) : null}

          {/* Ciclo de Vida */}
          {enrichment?.lifecycle ? (
            renderCollapsibleSection(
              'lifecycle', 'Ciclo de Vida', 'sync', '#009688',
              <Text style={styles.sectionBodyText}>{enrichment.lifecycle}</Text>
            )
          ) : null}

          {/* Monitoramento */}
          {enrichment?.monitoring && enrichment.monitoring.length > 0 ? (
            renderCollapsibleSection(
              'monitoring', 'Monitoramento', 'binoculars', AppTheme.techIndigo,
              renderBulletList(enrichment.monitoring)
            )
          ) : null}

          {/* Controle Cultural / MIP */}
          {enrichment?.cultural_treatment && enrichment.cultural_treatment.length > 0 ? (
            renderCollapsibleSection(
              'cultural', 'Controle Cultural / MIP', 'hand-back-left', AppTheme.accent,
              renderBulletList(enrichment.cultural_treatment)
            )
          ) : null}

          {/* Controle Quimico */}
          {enrichment?.chemical_treatment && enrichment.chemical_treatment.length > 0 ? (
            renderCollapsibleSection(
              'chemical', 'Controle Qu\u00edmico', 'flask', AppTheme.techBlue,
              <View>
                <View style={styles.agronomistWarning}>
                  <MaterialCommunityIcons name="alert" size={14} color="#FF9500" />
                  <Text style={styles.agronomistWarningText}>
                    Consulte um agr\u00f4nomo para receitu\u00e1rio agron\u00f4mico
                  </Text>
                </View>
                {renderBulletList(enrichment.chemical_treatment)}
              </View>
            )
          ) : null}

          {/* Controle Biologico */}
          {enrichment?.biological_treatment && enrichment.biological_treatment.length > 0 ? (
            renderCollapsibleSection(
              'biological', 'Controle Biol\u00f3gico', 'ladybug', AppTheme.accentLight,
              renderBulletList(enrichment.biological_treatment)
            )
          ) : null}

          {/* Produtos Recomendados */}
          {enrichment?.recommended_products && enrichment.recommended_products.length > 0 ? (
            renderCollapsibleSection(
              'products', 'Produtos Recomendados', 'pill', '#4DB6AC',
              <View>
                <View style={styles.agronomistWarning}>
                  <MaterialCommunityIcons name="alert" size={14} color="#FF9500" />
                  <Text style={styles.agronomistWarningText}>
                    Verifique registro no AGROFIT/MAPA antes de aplicar
                  </Text>
                </View>
                {enrichment.recommended_products.map((product, idx) =>
                  renderProductCard(product, idx)
                )}
              </View>
            )
          ) : null}

          {/* Prevencao */}
          {enrichment?.prevention && enrichment.prevention.length > 0 ? (
            renderCollapsibleSection(
              'prevention', 'Preven\u00e7\u00e3o', 'shield-check', '#00BCD4',
              renderBulletList(enrichment.prevention)
            )
          ) : null}

          {/* Resistencia */}
          {enrichment?.resistance_info ? (
            renderCollapsibleSection(
              'resistance', 'Resist\u00eancia', 'shield-alert', AppTheme.coral,
              <Text style={styles.sectionBodyText}>{enrichment.resistance_info}</Text>
            )
          ) : null}

          {/* Impacto Economico */}
          {enrichment?.economic_impact ? (
            renderCollapsibleSection(
              'impact', 'Impacto Econ\u00f4mico', 'chart-line-variant', AppTheme.coral,
              <Text style={styles.sectionBodyText}>{enrichment.economic_impact}</Text>
            )
          ) : null}

          {/* Pragas Relacionadas */}
          {enrichment?.related_pests && enrichment.related_pests.length > 0 ? (
            renderCollapsibleSection(
              'related', 'Pragas Relacionadas', 'link-variant', AppTheme.techIndigo,
              renderBulletList(enrichment.related_pests)
            )
          ) : null}

          {/* Estrategia MIP */}
          {enrichment?.mip_strategy ? (
            renderCollapsibleSection(
              'mip', 'Estrat\u00e9gia MIP', 'shield-half-full', AppTheme.accent,
              <Text style={styles.sectionBodyText}>{enrichment.mip_strategy}</Text>
            )
          ) : null}

          {/* Nivel de Acao */}
          {enrichment?.action_threshold ? (
            renderCollapsibleSection(
              'threshold', 'N\u00edvel de A\u00e7\u00e3o', 'speedometer', AppTheme.warmAmber,
              <Text style={styles.sectionBodyText}>{enrichment.action_threshold}</Text>
            )
          ) : null}

          {/* Confidence Detail Card */}
          <View style={styles.confidenceCard}>
            <View style={styles.confidenceCardHeader}>
              <MaterialCommunityIcons name="cpu-64-bit" size={16} color={AppTheme.accent} />
              <Text style={styles.confidenceCardTitle}>Detalhes da An\u00e1lise</Text>
            </View>
            <View style={styles.divider} />

            <DetailRowView label="Cultura selecionada" value={diagnosisResult.crop || selectedCrop.displayName} />
            {diagnosisResult.confidence != null && (
              <DetailRowView
                label="Confian\u00e7a da praga"
                value={`${Math.round((diagnosisResult.confidence ?? 0) * 100)}%`}
              />
            )}
            {diagnosisResult.pest_id && (
              <DetailRowView label="ID Agrio" value={diagnosisResult.pest_id} />
            )}
            {diagnosisResult.location_name && (
              <DetailRowView label="Localiza\u00e7\u00e3o" value={diagnosisResult.location_name} />
            )}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function DetailRowView({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  }

  function renderCollapsibleSection(
    id: string,
    title: string,
    icon: string,
    color: string,
    content: React.ReactNode
  ) {
    const isExpanded = expandedSections.has(id);

    return (
      <View style={styles.collapsibleSection} key={id}>
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => toggleSection(id)}
          activeOpacity={0.7}
        >
          <View style={[styles.collapsibleIconBox, { backgroundColor: color + '1F' }]}>
            <MaterialCommunityIcons name={icon as any} size={16} color={color} />
          </View>
          <Text style={styles.collapsibleTitle}>{title}</Text>
          <MaterialCommunityIcons
            name={isExpanded ? 'chevron-down' : 'chevron-right'}
            size={16}
            color={AppTheme.textTertiary}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View>
            <View style={styles.collapsibleDivider} />
            <View style={styles.collapsibleContent}>{content}</View>
          </View>
        )}
      </View>
    );
  }

  function renderBulletList(items: string[]) {
    return (
      <View>
        {items.map((item, idx) => (
          <View style={styles.bulletRow} key={idx}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderProductCard(product: AgrioProduct, idx: number) {
    return (
      <View style={styles.productCard} key={idx}>
        <Text style={styles.productName}>{product.name}</Text>
        {product.active_ingredient && (
          <View style={styles.productRow}>
            <Text style={styles.productLabel}>Princ\u00edpio ativo:</Text>
            <Text style={styles.productValue}>{product.active_ingredient}</Text>
          </View>
        )}
        {product.dosage && (
          <View style={styles.productRow}>
            <Text style={styles.productLabel}>Dosagem:</Text>
            <Text style={styles.productValue}>{product.dosage}</Text>
          </View>
        )}
        {product.safety_period && (
          <View style={styles.productRow}>
            <Text style={styles.productLabel}>Car\u00eancia:</Text>
            <Text style={styles.productValue}>{product.safety_period}</Text>
          </View>
        )}
        {product.toxic_class && (
          <View style={styles.productRow}>
            <Text style={styles.productLabel}>Classe:</Text>
            <Text style={styles.productValue}>{product.toxic_class}</Text>
          </View>
        )}
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5 - Error
  // ═══════════════════════════════════════════════════════════════════════

  function renderError() {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIconCircle}>
          <MaterialCommunityIcons name="alert-circle" size={56} color={AppTheme.coral} />
        </View>
        <Text style={styles.errorTitle}>Erro no Diagn\u00f3stico</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>

        <TouchableOpacity style={styles.errorButton} onPress={resetFlow} activeOpacity={0.8}>
          <Text style={styles.errorButtonText}>Fechar</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: AppTheme.background,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: AppTheme.text,
  },

  // ── Step 1: Photo Selection ─────────────────────────────────────────────
  cameraIconContainer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  radialOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: AppTheme.accent + '08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: AppTheme.accent + '33',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: AppTheme.text,
    marginBottom: 8,
  },
  mainDescription: {
    fontSize: 14,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionsContainer: {
    paddingHorizontal: 16,
    gap: 14,
    marginBottom: 24,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  actionIconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextColumn: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AppTheme.text,
    marginBottom: 3,
  },
  actionSubtitle: {
    fontSize: 12,
    color: AppTheme.textSecondary,
  },
  tipsContainer: {
    paddingHorizontal: 16,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  tipsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.warmAmber,
  },
  tipsCard: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tipText: {
    fontSize: 14,
    color: AppTheme.textSecondary,
  },

  // ── Step 2: Crop Selection ──────────────────────────────────────────────
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    gap: 14,
  },
  imagePreviewThumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  imagePreviewText: {
    flex: 1,
  },
  imagePreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.text,
    marginBottom: 4,
  },
  imagePreviewSubtitle: {
    fontSize: 12,
    color: AppTheme.textSecondary,
  },
  cropSelectorHeader: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    gap: 6,
  },
  cropSelectorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: AppTheme.text,
  },
  cropSelectorSubtitle: {
    fontSize: 12,
    color: AppTheme.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: AppTheme.surfaceCard,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.text,
    padding: 0,
  },
  cropGrid: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  cropGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cropCard: {
    width: (SCREEN_WIDTH - 32 - 30) / 4,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cropIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  cropName: {
    fontSize: 11,
    fontWeight: '600',
    color: AppTheme.text,
    textAlign: 'center',
  },
  startButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    backgroundColor: AppTheme.accent,
    borderRadius: 14,
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Step 3: Analyzing ───────────────────────────────────────────────────
  analyzingContainer: {
    flex: 1,
    alignItems: 'center',
  },
  analyzingCenter: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
  },
  progressTrack: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 5,
    borderColor: AppTheme.surfaceCard,
  },
  progressCircleWrapper: {
    position: 'absolute',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressArc: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 5,
    borderTopColor: AppTheme.accent,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  leafContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppTheme.accent + '1F',
  },
  analyzingStatusSection: {
    alignItems: 'center',
    marginTop: 36,
    gap: 10,
  },
  analyzingStatusText: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.text,
  },
  analyzingPercent: {
    fontSize: 16,
    fontWeight: '800',
    color: AppTheme.accent,
    fontVariant: ['tabular-nums'],
  },
  progressBarTrack: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppTheme.surfaceCard,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: AppTheme.accent,
  },
  analyzingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 32,
  },
  analyzingFooterText: {
    fontSize: 13,
    color: AppTheme.textTertiary,
  },

  // ── Step 4: Result ──────────────────────────────────────────────────────
  resultHeader: {
    padding: 20,
    minHeight: 120,
    justifyContent: 'flex-end',
  },
  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resultHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPestName: {
    fontSize: 22,
    fontWeight: '800',
    color: AppTheme.text,
  },
  resultScientific: {
    fontSize: 14,
    color: AppTheme.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  badgeRow: {
    paddingVertical: 16,
    backgroundColor: AppTheme.cardBackground,
  },
  badgeRowInner: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionsContainer: {
    paddingTop: 16,
    gap: 12,
  },
  collapsibleSection: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  collapsibleIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsibleTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: AppTheme.text,
  },
  collapsibleDivider: {
    height: 1,
    backgroundColor: AppTheme.border,
    marginHorizontal: 16,
  },
  collapsibleContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionBodyText: {
    fontSize: 14,
    color: AppTheme.text,
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppTheme.accent,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.text,
    lineHeight: 20,
  },
  agronomistWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#FF950014',
    borderRadius: 8,
    marginBottom: 10,
  },
  agronomistWarningText: {
    fontSize: 12,
    color: '#FF9500',
    flex: 1,
  },
  productCard: {
    padding: 10,
    backgroundColor: AppTheme.surfaceCard,
    borderRadius: 8,
    marginBottom: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.text,
    marginBottom: 6,
  },
  productRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  productLabel: {
    fontSize: 12,
    color: AppTheme.textSecondary,
  },
  productValue: {
    fontSize: 12,
    color: AppTheme.text,
  },
  confidenceCard: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  confidenceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  confidenceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: AppTheme.accent,
  },
  divider: {
    height: 1,
    backgroundColor: AppTheme.border,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: AppTheme.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.text,
  },

  // ── Step 5: Error ───────────────────────────────────────────────────────
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: AppTheme.coral + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: AppTheme.text,
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  errorButton: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    backgroundColor: AppTheme.coral,
    borderRadius: 14,
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
