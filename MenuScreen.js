import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, Animated, Easing, Image,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MENU, CATEGORIES } from './menu';
import { useApp } from './AppContext';
import { trackMenuView, trackItemView, queryMomentsAPI, trackAIPairingOpened, trackAIPairingResult } from './tealium';
import { colors, typography, spacing, radius, shadow } from './theme';
import { EspressoIcon, LatteIcon, IcedCupIcon, HotChocIcon, ChaiIcon, TeaIcon, ChevronIcon } from './CoffeeIcons';
import { buildRecommendation } from './recommendations';
import { getAIPairing } from './foodPairingAI';
import { formatTime, isCurrentlyInBreak } from './storeUtils';

const CATEGORY_ICONS = {
  'Milk-Based': LatteIcon,
  'Espresso': EspressoIcon,
  'Iced & Cold': IcedCupIcon,
  'Specialty': HotChocIcon,
  'Tea': TeaIcon,
};

function AiSparkIcon({ size = 22, color = '#fff' }) {
  return (
    <Text style={{ fontSize: size, lineHeight: size + 4 }}>✦</Text>
  );
}

function TypingText({ text, onDone, speed = 18 }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);
  return (
    <Text style={styles.aiReasonText}>
      {displayed}
      {!done && <Text style={{ color: colors.primary }}>▌</Text>}
    </Text>
  );
}

function BrewingCup() {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const steam1 = useRef(new Animated.Value(0)).current;
  const steam2 = useRef(new Animated.Value(0)).current;
  const steam3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(fillAnim, { toValue: 1, duration: 4000, useNativeDriver: false })
    ).start();
    [steam1, steam2, steam3].forEach((s, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 300),
          Animated.timing(s, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(s, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={{ width: 120, height: 130, alignItems: 'center', marginBottom: 8 }}>
      {/* Steam */}
      {[steam1, steam2, steam3].map((anim, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', top: 0,
          left: 30 + i * 20, width: 4, height: 24,
          borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)',
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) }],
        }} />
      ))}
      {/* Cup */}
      <View style={{ marginTop: 28, width: 90, height: 70, borderRadius: 8, borderWidth: 2.5, borderColor: '#fff', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <Animated.View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: fillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }),
          backgroundColor: '#5c3317',
        }} />
      </View>
      {/* Handle */}
      <View style={{ position: 'absolute', right: 8, top: 42, width: 18, height: 30, borderRadius: 12, borderWidth: 2.5, borderColor: '#fff', borderLeftColor: 'transparent' }} />
      {/* Saucer */}
      <View style={{ width: 100, height: 8, borderRadius: 4, backgroundColor: '#fff', marginTop: 2 }} />
    </View>
  );
}

export default function MenuScreen() {
  const navigation = useNavigation();
  const { state } = useApp();
  const { width: screenWidth } = useWindowDimensions();
  const slideWidth = screenWidth - 32 - (spacing.lg * 2); // 16px overlay padding each side + modal padding
  const isClosed = !state.storeOpen || isCurrentlyInBreak(state.storeBreaks);

  // All hooks must be declared before any early return (Rules of Hooks)
  const [activeCategory, setActiveCategory] = useState('Milk-Based');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPhase, setAiPhase] = useState('idle');
  const [recommendation, setRecommendation] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState([]);
  const carouselRef = useRef(null);
  const thinkingAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const goToSlide = (index) => {
    setCurrentSlide(index);
    carouselRef.current?.scrollTo({ x: index * slideWidth, animated: true });
  };

  const FOOD_CATEGORIES = ['Morning Tea', 'Lunch', 'Snacks'];
  const foodTabsWithItems = FOOD_CATEGORIES.filter(
    (cat) => (state.customItems?.[cat] || []).length > 0
  );
  const allTabs = [...CATEGORIES, ...foodTabsWithItems];
  const isFoodCategory = FOOD_CATEGORIES.includes(activeCategory);

  useEffect(() => { trackMenuView(activeCategory); }, [activeCategory]);


  // Re-render every minute to pick up break schedule changes
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (isClosed) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.midnight }]}>
        <View style={styles.closedScreen}>
          <BrewingCup />
          <Text style={styles.closedTitle}>Back Soon!</Text>
          <Text style={styles.closedMsg}>
            {(state.closedMessage || '').replace(/☕/g, '').replace(/—|-/g, '').trim()}
            {'\n'}Check back soon.
          </Text>
          {state.storeBreaks.filter(b => b.active).length > 0 && (
            <View style={styles.closedBreaks}>
              <Text style={styles.closedBreaksTitle}>Today's Break Times</Text>
              {state.storeBreaks.filter(b => b.active).map(b => (
                <View key={b.id} style={styles.closedBreakRow}>
                  <Text style={styles.closedBreakLabel}>{b.label || 'Break'}</Text>
                  <Text style={styles.closedBreakTime}>{formatTime(b.start_time)} – {formatTime(b.end_time)}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.closedBrand}>✦ Tealium Coffee Demo</Text>
        </View>
      </SafeAreaView>
    );
  }

  const staticItems = !isFoodCategory
    ? MENU.filter((item) => item.category === activeCategory && state.menuEnabled[item.id] !== false)
    : [];
  const customDrinkItems = !isFoodCategory
    ? (state.customItems?.[activeCategory] || []).filter((item) => state.menuEnabled[item.id] !== false)
    : [];
  const foodItems = isFoodCategory ? (state.customItems?.[activeCategory] || []) : [];
  const visibleItems = [...staticItems, ...customDrinkItems];

  const handleItemPress = (item) => {
    if (isFoodCategory) return;
    trackItemView(item, activeCategory);
    navigation.navigate('ItemDetail', { item });
  };

  // Get customer's own orders
  const myOrders = state.orders.filter((o) => o.deviceId === state.deviceId);
  const hasOrders = myOrders.length > 0;

  const openAi = () => {
    setAiOpen(true);
    setAiPhase('idle');
    setCurrentSlide(0);
    setSlides([]);
    fadeAnim.setValue(0);
    trackAIPairingOpened();

    if (!hasOrders) return;

    setAiPhase('thinking');
    Animated.loop(
      Animated.sequence([
        Animated.timing(thinkingAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(thinkingAnim, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();

    const minDelay = new Promise((res) => setTimeout(res, 1800));
    const timeout = new Promise((res) => setTimeout(() => res(null), 5000));
    const aiQuery = getAIPairing({ orders: myOrders, customItems: state.customItems }).catch(() => null);
    const momentsQuery = Promise.race([queryMomentsAPI().catch(() => null), timeout]);

    Promise.all([minDelay, aiQuery, momentsQuery]).then(([, aiResult, momentsData]) => {
      const rec = buildRecommendation({
        orders: myOrders,
        customItems: state.customItems,
        momentsData,
        aiResult,
      });
      
      // Build slides array
      const builtSlides = [];
      
      // First slide: standard recommendation
      builtSlides.push({
        type: 'standard',
        data: rec,
      });
      
      // Check if we have Bedrock rank/sentiment from Moments API
      const hasBedrockData = momentsData?.properties && 
        (momentsData.properties['Bedrock - Rank'] || momentsData.properties['Bedrock - Sentiment']);
      
      if (hasBedrockData) {
        builtSlides.push({
          type: 'bedrock',
          data: {
            rank: momentsData.properties['Bedrock - Rank'],
            sentiment: momentsData.properties['Bedrock - Sentiment'],
            ...rec
          },
        });
      }
      
      setSlides(builtSlides);
      setRecommendation(rec);
      trackAIPairingResult(rec);
      thinkingAnim.stopAnimation();
      setAiPhase('insights');
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      setTimeout(() => setAiPhase('recommendation'), 800);
    });
  };

  const closeAi = () => {
    setAiOpen(false);
    setAiPhase('idle');
    thinkingAnim.stopAnimation();
  };

  const thinkingDots = [0, 1, 2].map((i) => {
    const opacity = thinkingAnim.interpolate({
      inputRange: [0, 0.33, 0.66, 1],
      outputRange: i === 0 ? [0.3, 1, 0.3, 0.3] : i === 1 ? [0.3, 0.3, 1, 0.3] : [0.3, 0.3, 0.3, 1],
    });
    return <Animated.Text key={i} style={[styles.dot, { opacity }]}>●</Animated.Text>;
  });

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>What'll it be?</Text>
            <Text style={styles.subtitle}>Choose your coffee</Text>
          </View>
          <TouchableOpacity style={styles.aiButton} onPress={openAi} activeOpacity={0.85}>
            <Text style={styles.aiButtonIcon}>✦</Text>
            <Text style={styles.aiButtonLabel}>AI Pairing</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {allTabs.map((cat) => {
            const isFood = FOOD_CATEGORIES.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.tab, activeCategory === cat && styles.tabActive, isFood && styles.tabFood]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.tabText, activeCategory === cat && styles.tabTextActive, isFood && styles.tabTextFood]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {isFoodCategory ? (
          foodItems.length === 0 ? (
            <View style={styles.foodBanner}>
              <Text style={styles.foodBannerText}>No items added yet. Add items in the Operator menu.</Text>
            </View>
          ) : (
            foodItems.map((item, i) => (
              <View key={item.id || i} style={styles.foodCard}>
                <Text style={styles.foodEmoji}>🍽️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                </View>
              </View>
            ))
          )
        ) : (
          visibleItems.map((item) => {
            const IconComp = CATEGORY_ICONS[item.category] || LatteIcon;
            return (
              <TouchableOpacity key={item.id} style={styles.card} onPress={() => handleItemPress(item)} activeOpacity={0.75}>
                <View style={styles.iconCircle}><IconComp size={28} color={colors.primary} /></View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                </View>
                <ChevronIcon size={20} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* AI Pairing Modal */}
      <Modal visible={aiOpen} transparent animationType="fade" onRequestClose={closeAi}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeAi}>
          <TouchableOpacity style={styles.aiModal} activeOpacity={1} onPress={() => {}}>

            {/* Header */}
            <View style={styles.aiModalHeader}>
              <View style={styles.aiModalTitleRow}>
                <View style={styles.aiIconBadge}><Text style={styles.aiIconBadgeText}>✦</Text></View>
                <Text style={styles.aiModalTitle}>AI Pairing</Text>
                <View style={styles.prismBadge}><Text style={styles.prismBadgeText}>PRISM</Text></View>
              </View>
              <TouchableOpacity onPress={closeAi} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* No orders state */}
            {!hasOrders && (
              <View style={styles.aiEmptyState}>
                <Text style={styles.aiEmptyIcon}>☕</Text>
                <Text style={styles.aiEmptyTitle}>Order a drink first</Text>
                <Text style={styles.aiEmptySubtitle}>
                  Place your first order and check back after it's made. AI will analyze your taste profile and suggest perfect food pairings.
                </Text>
                <View style={styles.aiBrandNote}>
                  <Text style={styles.aiBrandNoteText}>Powered by Tealium PRISM · On-device AI</Text>
                </View>
              </View>
            )}

            {/* Thinking state */}
            {hasOrders && aiPhase === 'thinking' && (
              <View style={styles.aiThinking}>
                <Text style={styles.aiThinkingLabel}>Analysing your taste profile</Text>
                <View style={styles.dotsRow}>{thinkingDots}</View>
              </View>
            )}

            {/* Insights + Recommendation with Carousel */}
            {hasOrders && (aiPhase === 'insights' || aiPhase === 'recommendation') && recommendation && slides.length > 0 && (
              <Animated.View style={{ opacity: fadeAnim }}>

                {/* Swipeable Carousel — native ScrollView paging */}
                <ScrollView
                  ref={carouselRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
                    setCurrentSlide(index);
                  }}
                  style={{ width: slideWidth }}
                  contentContainerStyle={{ flexDirection: 'row' }}
                >
                  {/* Render all slides side by side */}
                  {slides.map((slide, index) => (
                    <View key={index} style={{ width: slideWidth, paddingHorizontal: 4 }}>
                        {slide.type === 'standard' && (
                          <>
                            {/* Visitor insights strip */}
                            <View style={styles.insightsRow}>
                              <View style={styles.insightChip}>
                                <Text style={styles.insightChipLabel}>Orders</Text>
                                <Text style={styles.insightChipValue}>{recommendation.totalOrders}</Text>
                              </View>
                              <View style={styles.insightChip}>
                                <Text style={styles.insightChipLabel}>Pickup</Text>
                                <Text style={styles.insightChipValue}>{recommendation.pickupOrders ?? '—'}</Text>
                              </View>
                              <View style={styles.insightChip}>
                                <Text style={styles.insightChipLabel}>Usage</Text>
                                <Text style={styles.insightChipValue} numberOfLines={1}>
                                  {recommendation.timeOnSite != null
                                    ? recommendation.timeOnSite >= 60
                                      ? `${(recommendation.timeOnSite / 60).toFixed(1)}hr`
                                      : `${Math.round(recommendation.timeOnSite)}m`
                                    : '—'}
                                </Text>
                              </View>
                            </View>

                            {/* Favourite drink statement */}
                            {recommendation.favouriteDrink && (
                              <View style={styles.favouriteStatement}>
                                <Text style={styles.favouriteStatementText}>
                                  ☕ Based on your favourite drink,{' '}
                                  <Text style={styles.favouriteStatementDrink}>{recommendation.favouriteDrink}</Text>
                                  , here's what we recommend:
                                </Text>
                              </View>
                            )}

                            {/* Badges from AudienceStream */}
                            {recommendation.badges?.length > 0 && (
                              <View style={styles.badgesRow}>
                                {recommendation.badges.map((badge, i) => (
                                  <View key={i} style={styles.badge}>
                                    <Text style={styles.badgeText}>🏅 {badge}</Text>
                                  </View>
                                ))}
                              </View>
                            )}

                            {/* Recommendation */}
                            {aiPhase === 'recommendation' && (
                              <View style={styles.recSection}>
                                {recommendation.suggestions?.length > 0 ? (
                                  <>
                                    {recommendation.suggestions.map((item, i) => (
                                      <View key={i} style={styles.recItem}>
                                        <Text style={styles.recItemEmoji}>🍽️</Text>
                                        <View style={{ flex: 1 }}>
                                          <Text style={styles.recItemName}>{item.name}</Text>
                                          {item.cat && <Text style={styles.recItemCat}>{item.cat}</Text>}
                                        </View>
                                      </View>
                                    ))}
                                    <TypingText text={recommendation.reason} speed={20} />
                                  </>
                                ) : (
                                  <View style={styles.aiEmptyState}>
                                    <Text style={styles.aiEmptySubtitle}>No food items available yet. Ask the barista to add items to the menu.</Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </>
                        )}

                        {slide.type === 'bedrock' && (
                          <View style={styles.bedrockSlide}>
                            <View style={styles.bedrockHeader}>
                              <Image
                                source={{ uri: 'https://miro.medium.com/v2/0*jxBA7rdI57KJZ-Jr.png' }}
                                style={styles.bedrockImage}
                                resizeMode="contain"
                              />
                              <Text style={styles.bedrockTitle}>Amazon Bedrock Insights</Text>
                            </View>

                            <View style={styles.bedrockContent}>
                              {slide.data.rank && (
                                <View style={styles.bedrockMetric}>
                                  <Text style={styles.bedrockMetricLabel}>Recommendation Rank</Text>
                                  <Text style={styles.bedrockMetricValue}>{slide.data.rank}</Text>
                                </View>
                              )}

                              {slide.data.sentiment && (
                                <View style={styles.bedrockMetric}>
                                  <Text style={styles.bedrockMetricLabel}>Sentiment Analysis</Text>
                                  <Text style={styles.bedrockMetricValue}>{slide.data.sentiment}</Text>
                                </View>
                              )}

                              <View style={styles.bedrockExplainer}>
                                <Text style={styles.bedrockExplainerText}>
                                  Using Amazon Bedrock AI, we've analyzed your order history and preferences to provide personalized recommendations.
                                </Text>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    ))}
                  </ScrollView>

                <View style={styles.aiBrandNote}>
                  <Text style={styles.aiBrandNoteText}>
                    {recommendation?.aiEngine
                      ? `✦ ${recommendation.aiEngine} · Tealium PRISM${recommendation.aiConfidence ? ` · ${recommendation.aiConfidence}% confidence` : ''}`
                      : 'Powered by Tealium PRISM'}
                  </Text>
                </View>

                {/* Navigation arrows if multiple slides */}
                {slides.length > 1 && (
                  <View style={styles.carouselNav}>
                    <TouchableOpacity
                      style={[styles.carouselNavBtn, currentSlide === 0 && styles.carouselNavBtnDisabled]}
                      onPress={() => goToSlide(currentSlide - 1)}
                      disabled={currentSlide === 0}
                    >
                      <Text style={[styles.carouselNavText, currentSlide === 0 && styles.carouselNavTextDisabled]}>‹</Text>
                    </TouchableOpacity>
                    <Text style={styles.carouselNavLabel}>
                      {currentSlide + 1} / {slides.length}
                    </Text>
                    <TouchableOpacity
                      style={[styles.carouselNavBtn, currentSlide === slides.length - 1 && styles.carouselNavBtnDisabled]}
                      onPress={() => goToSlide(currentSlide + 1)}
                      disabled={currentSlide === slides.length - 1}
                    >
                      <Text style={[styles.carouselNavText, currentSlide === slides.length - 1 && styles.carouselNavTextDisabled]}>›</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            )}

          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  closedScreen: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, gap: 16,
  },
  closedIcon: { fontSize: 64 },
  closedTitle: { fontSize: 32, fontWeight: '800', color: '#fff' },
  closedMsg: { fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 24 },
  closedBreaks: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg, padding: spacing.md, gap: 8, marginTop: 8,
  },
  closedBreaksTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' },
  closedBreakRow: { flexDirection: 'row', justifyContent: 'space-between' },
  closedBreakLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  closedBreakTime: { fontSize: 14, color: colors.teal, fontWeight: '600' },
  closedBrand: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginTop: 16 },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.midnight,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 10,
  },
  closedBannerIcon: { fontSize: 20 },
  closedBannerText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.heading1 },
  subtitle: { ...typography.subtitle, marginTop: 2 },

  aiButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.midnight, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    ...shadow.card,
  },
  aiButtonIcon: { fontSize: 14, color: colors.teal },
  aiButtonLabel: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  tabsWrapper: { height: 48 },
  tabsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center', height: 48 },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMid },
  tabTextActive: { color: '#fff' },
  tabFood: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  tabTextFood: { color: colors.primary },
  divider: { height: 1, backgroundColor: colors.border, marginTop: spacing.sm },

  list: { padding: spacing.md, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, ...shadow.card },
  iconCircle: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, borderWidth: 1, borderColor: colors.primaryMid },
  cardText: { flex: 1 },
  cardName: { ...typography.heading3, fontSize: 16 },
  cardDesc: { ...typography.caption, marginTop: 2 },
  foodBanner: { backgroundColor: colors.tealLight, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.tealMid },
  foodBannerText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  foodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  foodEmoji: { fontSize: 28, marginRight: spacing.md },

  // AI Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,24,56,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: spacing.lg },
  aiModal: { backgroundColor: colors.surface, borderRadius: 24, width: '100%', padding: spacing.lg, ...shadow.modal },

  aiModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  aiModalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiIconBadge: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
  aiIconBadgeText: { fontSize: 14, color: colors.teal },
  aiModalTitle: { fontSize: 17, fontWeight: '800', color: colors.midnight },
  prismBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.primaryMid },
  prismBadgeText: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: colors.textMid, fontWeight: '600' },

  aiEmptyState: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  aiEmptyIcon: { fontSize: 40 },
  aiEmptyTitle: { fontSize: 16, fontWeight: '700', color: colors.midnight },
  aiEmptySubtitle: { fontSize: 14, color: colors.textMid, textAlign: 'center', lineHeight: 20 },

  aiThinking: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  aiThinkingLabel: { fontSize: 14, color: colors.textMid, fontWeight: '600' },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { fontSize: 10, color: colors.primary },

  insightsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  insightChip: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  insightChipLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  insightChipValue: { fontSize: 12, fontWeight: '700', color: colors.midnight, marginTop: 2 },

  recSection: { gap: spacing.sm, marginBottom: spacing.md },
  recSectionTitle: { fontSize: 15, fontWeight: '800', color: colors.midnight, marginBottom: 4 },
  recCatLabel: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primaryMid },
  recCatText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  recItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  recItemEmoji: { fontSize: 20 },
  recItemName: { fontSize: 15, fontWeight: '600', color: colors.midnight },
  recItemCat: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  aiReasonText: { fontSize: 13, color: colors.textMid, lineHeight: 19, fontStyle: 'italic', marginTop: spacing.sm },

  favouriteStatement: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryMid,
  },
  favouriteStatementText: { fontSize: 13, color: colors.textMid, lineHeight: 19 },
  favouriteStatementDrink: { fontWeight: '700', color: colors.primary },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  badge: { backgroundColor: '#fff8e8', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: '#f0d080' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#8a6000' },
  aiBrandNote: { alignItems: 'center', marginTop: spacing.md },
  aiBrandNoteText: { fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },

  // Carousel
  carouselNav: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md, paddingHorizontal: spacing.sm,
  },
  carouselNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  carouselNavBtnDisabled: { backgroundColor: colors.borderLight },
  carouselNavText: { fontSize: 22, color: '#fff', fontWeight: '700', lineHeight: 28 },
  carouselNavTextDisabled: { color: colors.textMuted },
  carouselNavLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  carouselNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  carouselNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselNavBtnDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
  carouselNavText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  carouselNavLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMid,
  },

  // Bedrock Slide
  bedrockSlide: {
    gap: spacing.md,
  },
  bedrockHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  bedrockImage: {
    width: 120,
    height: 60,
  },
  bedrockTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.midnight,
  },
  bedrockContent: {
    gap: spacing.md,
  },
  bedrockMetric: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bedrockMetricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bedrockMetricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  bedrockExplainer: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryMid,
  },
  bedrockExplainerText: {
    fontSize: 13,
    color: colors.textMid,
    lineHeight: 19,
    fontStyle: 'italic',
  },
});