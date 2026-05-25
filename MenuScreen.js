import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Animated, Easing, Image, useWindowDimensions, Platform, Alert,
} from 'react-native';

import DRINK_IMAGES from './drinkImages';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MENU, CATEGORIES } from './menu';
import { useApp } from './AppContext';
import { useAuth } from './AuthContext';
import { trackMenuView, trackItemView, queryMomentsAPI, trackAIPairingOpened, trackAIPairingResult, trackAIPairingCarousel, trackAddToOrder } from './tealium';
import { colors, typography, spacing, radius, shadow, fonts } from './theme';
import { EspressoIcon, LatteIcon, IcedCupIcon, HotChocIcon, ChaiIcon, TeaIcon, ChevronIcon, AiSparkIcon, MorningTeaIcon, LunchIcon, SnacksIcon, ReorderIcon } from './CoffeeIcons';
import { buildRecommendation } from './recommendations';
import { getAIPairing, getExpectedAIProvider, getThinkingLabel } from './foodPairingAI';
import { formatTime, isCurrentlyInBreak } from './storeUtils';

const CATEGORY_ICONS = {
  'Milk-Based': LatteIcon,
  'Espresso': EspressoIcon,
  'Iced & Cold': IcedCupIcon,
  'Specialty': HotChocIcon,
  'Tea': TeaIcon,
  'Morning Tea': MorningTeaIcon,
  'Lunch': LunchIcon,
  'Snacks': SnacksIcon,
};


// Reverses the drink_summary encoding: Category_Milk?_DrinkName_Size_Extras...
// e.g. 'Milk-Based_Full_Cream_Cappuccino_Small' → { category, milk, name, size }
function parseLastDrinkSummary(summary) {
  if (!summary || typeof summary !== 'string') return null;

  const KNOWN_CATS = ['Milk-Based', 'Espresso', 'Iced & Cold', 'Specialty', 'Tea'];
  const KNOWN_SIZES = ['Small', 'Medium', 'Large'];
  // Ordered longest-first so 'Half & Half' (3 tokens) beats 'Oat' (1 token) in prefix matching
  const KNOWN_MILK = ['Half & Half', 'Full Cream', 'Coconut', 'Macadamia', 'Almond', 'Skim', 'Oat', 'Soy'];

  let tokens = summary.split('_');
  let category = null;
  let size = 'Medium';
  let milk = 'No Milk';

  for (const cat of KNOWN_CATS) {
    const catTokens = cat.replace(/\s+/g, '_').split('_');
    if (tokens.slice(0, catTokens.length).join('_') === catTokens.join('_')) {
      category = cat;
      tokens = tokens.slice(catTokens.length);
      break;
    }
  }

  for (const milkOpt of KNOWN_MILK) {
    const milkTokens = milkOpt.replace(/\s+/g, '_').split('_');
    if (tokens.slice(0, milkTokens.length).join('_') === milkTokens.join('_')) {
      milk = milkOpt;
      tokens = tokens.slice(milkTokens.length);
      break;
    }
  }

  // Size comes right after the drink name — find its index and slice there
  const sizeIdx = tokens.findIndex(t => KNOWN_SIZES.includes(t));
  if (sizeIdx >= 0) {
    size = tokens[sizeIdx];
    tokens = tokens.slice(0, sizeIdx);
  }

  const name = tokens.join(' ');
  if (!name) return null;
  return { category, name, milk, size };
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
  const { state, dispatch } = useApp();
  const { isAdmin } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const slideWidth = screenWidth - 32 - (spacing.lg * 2);
  const insets = useSafeAreaInsets();

  const isClosed = !state.storeOpen || isCurrentlyInBreak(state.storeBreaks);

  // All hooks must be declared before any early return (Rules of Hooks)
  const [activeCategory, setActiveCategory] = useState('Milk-Based');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPhase, setAiPhase] = useState('idle');
  const [recommendation, setRecommendation] = useState(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState([]);
  const carouselRef = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const thinkingAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const tabScrollRef = useRef(null);
  const sectionOffsets = useRef({});
  const tabOffsets = useRef({});
  const activeCategoryRef = useRef('Milk-Based');
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => {
    const tab = tabOffsets.current[activeCategory];
    if (tab) {
      tabScrollRef.current?.scrollTo({
        x: Math.max(0, tab.x - screenWidth / 2 + tab.width / 2),
        animated: true,
      });
    }
  }, [activeCategory]);

  const [lastDrink, setLastDrink] = useState(null);

  // Fetch last drink order from Moments API when profile email is available
  useEffect(() => {
    const email = state.profile?.email;
    if (!email || isAdmin) return;
    let cancelled = false;
    queryMomentsAPI().then((data) => {
      if (cancelled || !data?.properties) return;
      const props = data.properties;
      const lastDrinkKey = Object.keys(props).find((k) => {
        const norm = k.toLowerCase().replace(/[\s_-]/g, '');
        return norm.includes('lastdrinkorder') || norm.includes('lastdrink');
      });
      if (!lastDrinkKey) return;
      const parsed = parseLastDrinkSummary(props[lastDrinkKey]);
      if (!parsed?.name) return;
      const menuItem = MENU.find((m) => m.name.toLowerCase() === parsed.name.toLowerCase());
      if (!menuItem) return;
      setLastDrink({ id: menuItem.id, name: menuItem.name, category: menuItem.category, milk: parsed.milk, size: parsed.size });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [state.profile?.email, isAdmin]);

  const handleReorder = () => {
    if (!lastDrink) return;
    if (state.menuEnabled[lastDrink.id] === false) {
      Alert.alert('Not available', `${lastDrink.name} is not on the menu right now.`);
      return;
    }
    const orderItem = {
      id: lastDrink.id,
      name: lastDrink.name,
      category: lastDrink.category,
      size: lastDrink.size,
      milk: lastDrink.milk,
      extras: [],
      specialRequest: '',
    };
    dispatch({ type: 'ADD_ITEM', payload: orderItem });
    const menuItem = MENU.find((m) => m.id === lastDrink.id);
    if (menuItem) trackAddToOrder(menuItem, orderItem);
    navigation.navigate('OrderSummary');
  };

  const goToSlide = (index) => {
    if (index < 0 || index >= slides.length) return;
    setCurrentSlide(index);
    trackAIPairingCarousel(index);
  };

  const FOOD_CATEGORIES = ['Morning Tea', 'Lunch', 'Snacks'];
  const foodTabsWithItems = FOOD_CATEGORIES.filter(
    (cat) => (state.customItems?.[cat] || []).some(item => state.menuEnabled[item.id] !== false)
  );
  const allTabs = [...CATEGORIES, ...foodTabsWithItems];

  const handleTabPress = (cat) => {
    setActiveCategory(cat);
    trackMenuView(cat);
    const y = sectionOffsets.current[cat];
    if (y != null) {
      isProgrammaticScroll.current = true;
      scrollRef.current?.scrollTo({ y, animated: true });
      setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
    }
  };

  const handleScroll = (e) => {
    if (isProgrammaticScroll.current) return;
    const y = e.nativeEvent.contentOffset.y;
    let current = allTabs[0];
    for (const cat of allTabs) {
      if ((sectionOffsets.current[cat] ?? Infinity) <= y + 100) current = cat;
    }
    if (current !== activeCategoryRef.current) setActiveCategory(current);
  };


  // Re-render every minute to pick up break schedule changes
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (isClosed) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.midnight }]}>
        <View style={styles.closedScreen}>
          <BrewingCup />
          <Text style={styles.closedTitle}>{state.closedTitle || 'Back Soon!'}</Text>
          <Text style={styles.closedMsg}>{state.closedMessage || "We're taking a short break — check back soon!"}</Text>
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

  const handleItemPress = (item) => {
    if (FOOD_CATEGORIES.includes(item.category)) return;
    trackItemView(item, item.category);
    navigation.navigate('ItemDetail', { item });
  };

  // Match on deviceId, tealAppUuid, or email — email fallback handles SecureStore
  // reset after package rename (new deviceId won't match old orders)
  const myOrders = state.orders.filter((o) => {
    if (state.deviceId && (o.deviceId === state.deviceId || o.tealAppUuid === state.deviceId)) return true;
    if (state.profile?.email && o.email === state.profile.email) return true;
    return false;
  });
  const hasOrders = myOrders.length > 0;

  const openAi = () => {
    setAiOpen(true);
    setCurrentSlide(0);
    setSlides([]);
    fadeAnim.setValue(0);
    trackAIPairingOpened();

    if (!hasOrders) {
      setAiPhase('no-orders');
      return;
    }

    setAiPhase('thinking');
    Animated.loop(
      Animated.sequence([
        Animated.timing(thinkingAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(thinkingAnim, { toValue: 0, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();

    const minDelay = new Promise((res) => setTimeout(res, 1800));
    const timeout = new Promise((res) => setTimeout(() => res(null), 5000));
    const momentsQuery = Promise.race([queryMomentsAPI().catch(() => null), timeout]);

    momentsQuery.then((momentsData) => {
      const dietaryRequirements = state.profile?.dietary_requirements
        || momentsData?.properties?.['Dietary Requirements']
        || null;
      const enabledCustomItems = Object.fromEntries(
        Object.entries(state.customItems).map(([cat, items]) => [
          cat, items.filter(item => state.menuEnabled[item.id] !== false),
        ])
      );
      const aiQuery = getAIPairing({ orders: myOrders, customItems: enabledCustomItems, dietaryRequirements }).catch(() => null);

      Promise.all([minDelay, aiQuery]).then(([, aiResult]) => {
        // No connection — OpenAI was attempted but failed
        if (aiResult?.source === 'offline') {
          thinkingAnim.stopAnimation();
          setAiPhase('offline');
          return;
        }

      const rec = buildRecommendation({
        orders: myOrders,
        customItems: enabledCustomItems,
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

      // Check if we have Bedrock rank/sentiment from Moments API.
      // Key lookup is case-insensitive so 'Bedrock - Rank', 'bedrock_rank', 'Bedrock Rank' etc. all match.
      const props = momentsData?.properties || {};
      const propKeys = Object.keys(props);
      console.log('[AI Modal] Moments property keys:', propKeys);
      const rankKey = propKeys.find(k => k.toLowerCase().replace(/[\s_-]/g, '').includes('bedrockrank'));
      const sentimentKey = propKeys.find(k => k.toLowerCase().replace(/[\s_-]/g, '').includes('bedrocksentiment'));
      const hasBedrockData = !!(rankKey || sentimentKey);
      console.log('[AI Modal] Bedrock found:', hasBedrockData, '| rank key:', rankKey, '| sentiment key:', sentimentKey);

      if (hasBedrockData) {
        builtSlides.push({
          type: 'bedrock',
          data: {
            rank: rankKey ? props[rankKey] : null,
            sentiment: sentimentKey ? props[sentimentKey] : null,
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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>What'll it be?</Text>
            <Text style={styles.subtitle}>Choose your coffee</Text>
          </View>
          {!isAdmin && (
            <TouchableOpacity style={styles.aiButton} onPress={openAi} activeOpacity={0.85}>
              <AiSparkIcon size={14} color={colors.teal} />
              <Text style={styles.aiButtonLabel}>AI Pairing</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView ref={tabScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {allTabs.map((cat) => {
            const isFood = FOOD_CATEGORIES.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.tab, activeCategory === cat && styles.tabActive, isFood && styles.tabFood]}
                onPress={() => handleTabPress(cat)}
                onLayout={e => { tabOffsets.current[cat] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }; }}
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

      {/* Personalised reorder banner — shown when Moments API returns a last drink order */}
      {lastDrink && state.menuEnabled[lastDrink.id] !== false && !isAdmin && (
        <TouchableOpacity style={styles.reorderBanner} onPress={handleReorder} activeOpacity={0.85}>
          <View style={styles.reorderIconCircle}>
            <ReorderIcon size={18} color={colors.primary} />
          </View>
          <View style={styles.reorderLeft}>
            <View style={styles.reorderLabelRow}>
              <Text style={styles.reorderLabel}>Your last order</Text>
              <View style={styles.reorderPill}><Text style={styles.reorderPillText}>Moments API</Text></View>
            </View>
            <Text style={styles.reorderDrink} numberOfLines={1}>
              {lastDrink.milk !== 'No Milk' ? `${lastDrink.milk} ` : ''}{lastDrink.name}
              {lastDrink.size ? `, ${lastDrink.size}` : ''}
            </Text>
          </View>
          <View style={styles.reorderBtn}>
            <Text style={styles.reorderBtnText}>Reorder</Text>
            <ChevronIcon size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {allTabs.map((cat) => {
          const isFoodCat = FOOD_CATEGORIES.includes(cat);
          const catStaticItems = !isFoodCat
            ? MENU.filter(item => item.category === cat && state.menuEnabled[item.id] !== false)
            : [];
          const catCustomDrinks = !isFoodCat
            ? (state.customItems?.[cat] || []).filter(item => state.menuEnabled[item.id] !== false)
            : [];
          const catFoodItems = isFoodCat
            ? (state.customItems?.[cat] || []).filter(item => state.menuEnabled[item.id] !== false)
            : [];
          const catItems = [...catStaticItems, ...catCustomDrinks];
          const IconComp = CATEGORY_ICONS[cat];

          return (
            <View key={cat} onLayout={e => { sectionOffsets.current[cat] = e.nativeEvent.layout.y; }}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{cat}</Text>
              </View>

              {isFoodCat ? (
                catFoodItems.length === 0 ? (
                  <View style={styles.foodBanner}>
                    <Text style={styles.foodBannerText}>No items added yet. Add items in the Operator menu.</Text>
                  </View>
                ) : (
                  <>
                    {catFoodItems.map((item, i) => (
                      <View key={item.id || i} style={styles.foodCard}>
                        <View style={styles.foodIconWrap}>
                          {IconComp && <IconComp size={22} color={colors.primary} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardName}>{item.name}</Text>
                          {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                        </View>
                      </View>
                    ))}
                    <View style={styles.foodDisclaimer}>
                      <Text style={styles.foodDisclaimerTitle}>Dietary Legend</Text>
                      <Text style={styles.foodDisclaimerText}>
                        v – vegetarian{"\n"}ve – vegan{"\n"}g – contains gluten{"\n"}m – contains milk{"\n\n"}
                      </Text>
                      <Text style={styles.foodDisclaimerTitle}>Please note</Text>
                      <Text style={styles.foodDisclaimerText}>
                        Food items are provided directly by the venue and cannot be ordered through this app. For any dietary requirements or allergen information, please speak with a member of our staff.
                      </Text>
                    </View>
                  </>
                )
              ) : (
                catItems.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.card} onPress={() => handleItemPress(item)} activeOpacity={0.75}>
                    <View style={styles.iconCircle}>
                      {DRINK_IMAGES[item.id]
                        ? <Image source={DRINK_IMAGES[item.id]} style={styles.cardCatImage} resizeMode="contain" />
                        : <IconComp size={28} color={colors.primary} />
                      }
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardName}>{item.name}</Text>
                      {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                    </View>
                    <ChevronIcon size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          );
        })}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* AI Pairing Modal — customers only */}
      <Modal visible={aiOpen && !isAdmin} transparent animationType="fade" onRequestClose={closeAi}>
        {/*
          Outer View fills the screen and centres the card.
          It does NOT handle touches itself — that would fight the inner ScrollView.
        */}
        <View style={styles.modalOverlay}>

          {/*
            Backdrop tap-to-close sits as an absolute-fill layer BEHIND the card.
            Keeping it separate from the card means its gesture recogniser
            never competes with the ScrollView inside the card.
          */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={closeAi}
          />

          {/*
            Card: plain View — no TouchableOpacity, no responder override.
            height: 75% of screen gives the ScrollView a concrete measured height
            so React Native knows exactly how much space it has to scroll within.
            overflow: hidden clips content to the rounded corners.
          */}
          <View
            style={[styles.aiModal, { height: Math.max(screenHeight * 0.75, 300) }]}
          >

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

            {/*
              ScrollView is a direct child of the card with flex:1.
              The card has a fixed height so this gets a concrete measured height —
              no intermediate wrapper Views that confuse Android's flex resolution.
              Content taller than this height will scroll.
            */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >

            {/* No orders state */}
            {aiPhase === 'no-orders' && (
              <View style={styles.aiEmptyState}>
                <Text style={styles.aiEmptyIcon}>☕</Text>
                <Text style={styles.aiEmptyTitle}>Order a drink first</Text>
                <Text style={styles.aiEmptySubtitle}>
                  Place your first order and check back after it's made. AI will analyse your taste profile and suggest perfect food pairings.
                </Text>
                <View style={styles.aiBrandNote}>
                  <Text style={styles.aiBrandNoteText}>Powered by Tealium PRISM</Text>
                </View>
              </View>
            )}

            {/* Thinking state */}
            {aiPhase === 'thinking' && (
              <View style={styles.aiThinking}>
                <Text style={styles.aiThinkingLabel}>
                  {getThinkingLabel()}
                </Text>
                <View style={styles.dotsRow}>{thinkingDots}</View>
                {getExpectedAIProvider() === 'openai' && (
                  <Text style={styles.aiThinkingEngine}>GPT-4o mini · Cloud</Text>
                )}
              </View>
            )}

            {/* Offline — OpenAI attempted but no connection */}
            {aiPhase === 'offline' && (
              <View style={styles.aiEmptyState}>
                <Text style={styles.aiEmptyIcon}>📡</Text>
                <Text style={styles.aiEmptyTitle}>Connection required</Text>
                <Text style={styles.aiEmptySubtitle}>
                  AI pairing uses OpenAI and needs an internet connection. Connect to WiFi or mobile data and try again.
                </Text>
                <View style={styles.aiBrandNote}>
                  <Text style={styles.aiBrandNoteText}>GPT-4o mini · Cloud</Text>
                </View>
              </View>
            )}

            {/* Insights + Recommendation */}
            {(aiPhase === 'insights' || aiPhase === 'recommendation') && recommendation && slides.length > 0 && (
              <Animated.View style={{ opacity: fadeAnim }}>
                  {slides[currentSlide]?.type === 'standard' && (
                    <>
                      {/* Badges from AudienceStream — top of card */}
                      {recommendation.badges?.length > 0 && (
                        <View style={styles.badgesRow}>
                          {recommendation.badges.map((badge, i) => (
                            <View key={i} style={styles.badge}>
                              <Text style={styles.badgeText}>🏅 {badge}</Text>
                            </View>
                          ))}
                        </View>
                      )}

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
                            , here's what we recommend from the food menu:
                          </Text>
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
                              {(recommendation.aiSource === 'openai' || recommendation.aiSource === 'on-device-llm') && recommendation.aiEngine && (
                                <View style={styles.openAIBadge}>
                                  <Text style={styles.openAIBadgeText}>✦ Generated by {recommendation.aiEngine}</Text>
                                </View>
                              )}
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

                  {slides[currentSlide]?.type === 'bedrock' && (
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
                        {slides[currentSlide].data.sentiment && (
                          <View style={styles.bedrockMetric}>
                            <Text style={styles.bedrockMetricLabel}>Sentiment Analysis</Text>
                            <Text style={styles.bedrockMetricValue}>{slides[currentSlide].data.sentiment}</Text>
                          </View>
                        )}
                        <View style={styles.bedrockExplainer}>
                          <Text style={styles.bedrockExplainerText}>
                            Triggered via Tealium Connector. Data sent to Moments API on first purchase.
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
              </Animated.View>
            )}

            </ScrollView>

            {/* CarouselNav — direct card child, always below the ScrollView */}
            {(aiPhase === 'insights' || aiPhase === 'recommendation') && recommendation && slides.length > 1 && (
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

          </View>

        </View>
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
  closedTitle: { fontSize: 31, fontFamily: fonts.extrabold, color: '#fff' },
  closedMsg: { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 24 },
  closedBreaks: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg, padding: spacing.md, gap: 8, marginTop: 8,
  },
  closedBreaksTitle: { fontSize: 10, fontFamily: fonts.bold, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' },
  closedBreakRow: { flexDirection: 'row', justifyContent: 'space-between' },
  closedBreakLabel: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  closedBreakTime: { fontSize: 13, color: colors.teal, fontFamily: fonts.semibold },
  closedBrand: { fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginTop: 16 },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.midnight,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 10,
  },
  closedBannerIcon: { fontSize: 20 },
  closedBannerText: { flex: 1, color: '#fff', fontSize: 13, fontFamily: fonts.semibold },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.heading1, fontSize: 24 },
  subtitle: { ...typography.subtitle, marginTop: 2 },

  aiButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.midnight, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    ...shadow.card,
  },
  aiButtonIcon: { fontSize: 14, color: colors.teal },
  aiButtonLabel: { fontSize: 12, fontFamily: fonts.bold, color: '#fff', letterSpacing: 0.3 },

  tabsWrapper: { height: 48 },
  tabsContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center', height: 48 },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textMid },
  tabTextActive: { color: '#fff' },
  tabFood: { borderColor: colors.teal, backgroundColor: colors.tealLight },
  tabTextFood: { color: colors.primary },
  divider: { height: 1, backgroundColor: colors.border, marginTop: spacing.sm },

  list: { padding: spacing.md, gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: 2,
    marginTop: spacing.md, marginBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  sectionTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.textMid, letterSpacing: 0.5, textTransform: 'uppercase' },
  cardCatImage: { width: 52, height: 52, borderRadius: 26 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, ...shadow.card },
  iconCircle: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, borderWidth: 1, borderColor: colors.primaryMid, overflow: 'hidden' },
  cardText: { flex: 1 },
  cardName: { ...typography.heading3, fontSize: 15 },
  cardDesc: { ...typography.caption, marginTop: 2 },
  foodBanner: { backgroundColor: colors.tealLight, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.tealMid },
  foodBannerText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.primary },
  foodCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  foodIconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.tealLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  foodDisclaimer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  foodDisclaimerTitle: { fontSize: 10, fontFamily: fonts.bold, color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  foodDisclaimerText: { fontSize: 11, color: colors.textMuted, lineHeight: 18 },

  // AI Modal
  // flex:1 fills screen; justify/alignItems centre the card; padding = gutters from edges
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,24,56,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: spacing.lg },
  aiModal: { backgroundColor: colors.surface, borderRadius: 24, width: '100%', padding: spacing.md, overflow: 'hidden', ...shadow.modal },

  aiModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  aiModalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiIconBadge: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
  aiIconBadgeText: { fontSize: 14, color: colors.teal },
  aiModalTitle: { fontSize: 16, fontFamily: fonts.extrabold, color: colors.midnight },
  prismBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.primaryMid },
  prismBadgeText: { fontSize: 8, fontFamily: fonts.extrabold, color: colors.primary, letterSpacing: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 13, color: colors.textMid, fontFamily: fonts.semibold },

  aiEmptyState: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  aiEmptyIcon: { fontSize: 40 },
  aiEmptyTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.midnight },
  aiEmptySubtitle: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMid, textAlign: 'center', lineHeight: 20 },

  aiThinking: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  aiThinkingLabel: { fontSize: 13, color: colors.textMid, fontFamily: fonts.semibold },
  aiThinkingEngine: { fontSize: 9, color: colors.textMuted, letterSpacing: 0.5, marginTop: 4 },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { fontSize: 9, color: colors.primary },

  insightsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  insightChip: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight },
  insightChipLabel: { fontSize: 8, fontFamily: fonts.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  insightChipValue: { fontSize: 11, fontFamily: fonts.bold, color: colors.midnight, marginTop: 2 },

  recSection: { gap: spacing.xs, marginBottom: spacing.sm },
  recSectionTitle: { fontSize: 13, fontFamily: fonts.extrabold, color: colors.midnight, marginBottom: 4 },
  recCatLabel: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primaryMid },
  recCatText: { fontSize: 10, fontFamily: fonts.bold, color: colors.primary },
  recItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
  recItemEmoji: { fontSize: 15 },
  recItemName: { fontSize: 12, fontFamily: fonts.semibold, color: colors.midnight },
  recItemCat: { fontSize: 9, color: colors.textMuted, marginTop: 1 },
  aiReasonText: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMid, lineHeight: 19, marginTop: spacing.sm },

  favouriteStatement: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryMid,
  },
  favouriteStatementText: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMid, lineHeight: 19 },
  favouriteStatementDrink: { fontFamily: fonts.bold, color: colors.primary },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  badge: { backgroundColor: '#fff8e8', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: '#f0d080' },
  badgeText: { fontSize: 10, fontFamily: fonts.semibold, color: '#8a6000' },
  aiBrandNote: { alignItems: 'center', marginTop: spacing.md },
  aiBrandNoteText: { fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 },
  aiBrandNoteCloud: { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: '#bbf7d0' },
  openAIBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 5,
    backgroundColor: '#f0fdf4', borderRadius: radius.full,
    borderWidth: 1, borderColor: '#86efac',
  },
  openAIBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: '#16a34a', letterSpacing: 0.3 },

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
  carouselNavText: { fontSize: 21, color: '#fff', fontFamily: fonts.bold, lineHeight: 28 },
  carouselNavTextDisabled: { color: colors.textMuted },
  carouselNavLabel: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.semibold },
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
    fontSize: 17,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  carouselNavLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.textMid,
  },

  // Reorder banner
  reorderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tealLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.tealMid,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  reorderIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderLeft: { flex: 1 },
  reorderLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  reorderLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  reorderPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primaryMid,
  },
  reorderPillText: {
    fontSize: 8,
    fontFamily: fonts.extrabold,
    color: colors.primary,
    letterSpacing: 0.8,
  },
  reorderDrink: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.midnight,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  reorderBtnText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#fff',
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
    fontSize: 16,
    fontFamily: fonts.bold,
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
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bedrockMetricValue: {
    fontSize: 13,
    fontFamily: fonts.regular,
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
    fontSize: 12,
    color: colors.textMid,
    lineHeight: 19,
    fontStyle: 'italic',
  },
});