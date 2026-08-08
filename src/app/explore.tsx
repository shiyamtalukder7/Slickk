// SLICKK UI FOUNDATION V1
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import { SlickkBottomNav } from '@/components/slickk-bottom-nav';
import { getSlickkApiUrl } from '@/config/api';
import {
  SlickkColors,
  SlickkRadius,
  SlickkSpace,
  SlickkTypography,
} from '@/constants/slickk-design';
import {
  submitDailyCheckIn,
  type CheckInMood,
  type SchoolDay,
} from '@/services/daily-check-in';
import {
  loadStudentProfile,
  type StudentEducationProfile,
} from '@/services/student-profile';

type IconName =
  ComponentProps<typeof Ionicons>['name'];

type ServerStatus =
  | 'checking'
  | 'online'
  | 'offline';

type QuickAction = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  accent: 'mint' | 'blue' | 'amber';
  open: () => void;
};

const MOODS: {
  id: CheckInMood;
  label: string;
  icon: IconName;
}[] = [
  {
    id: 'great',
    label: 'Ready',
    icon: 'sunny-outline',
  },
  {
    id: 'okay',
    label: 'Okay',
    icon: 'partly-sunny-outline',
  },
  {
    id: 'tired',
    label: 'Tired',
    icon: 'moon-outline',
  },
];

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'S';
  }

  return parts
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function SlickkDashboardScreen() {
  const [serverStatus, setServerStatus] =
    useState<ServerStatus>('checking');

  const [profile, setProfile] =
    useState<StudentEducationProfile | null>(null);

  const [refreshing, setRefreshing] =
    useState(false);

  const [savingMood, setSavingMood] =
    useState(false);

  const [selectedMood, setSelectedMood] =
    useState<CheckInMood | null>(null);

  const entrance = useRef(
    new Animated.Value(0)
  ).current;

  const checkServer = useCallback(async () => {
    setServerStatus('checking');

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    try {
      const response = await fetch(
        getSlickkApiUrl('/health'),
        {
          signal: controller.signal,
        }
      );

      setServerStatus(
        response.ok ? 'online' : 'offline'
      );
    } catch {
      setServerStatus('offline');
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const loadHome = useCallback(async () => {
    const [loadedProfile] =
      await Promise.all([
        loadStudentProfile().catch(
          () => null
        ),
        checkServer(),
      ]);

    setProfile(loadedProfile);
  }, [checkServer]);

  useEffect(() => {
    void loadHome();

    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [entrance, loadHome]);

  const refresh = async () => {
    setRefreshing(true);

    try {
      await loadHome();
    } finally {
      setRefreshing(false);
    }
  };

  const openCamera = () => {
    router.push({
      pathname: '/camera-learn',
      params: {
        mode: 'camera',
      },
    });
  };

  const openHomework = () => {
    router.push({
      pathname: '/camera-learn',
      params: {
        mode: 'library',
      },
    });
  };

  const primarySubject =
    profile?.subjects?.[0] || 'Mathematics';

  const firstName =
    profile?.studentName
      ?.trim()
      .split(/\s+/)[0] || 'Student';

  const fullName =
    profile?.studentName || 'Student';

  const schoolContext = [
    profile?.grade || 'Class 7',
    profile?.school?.name || 'School profile',
  ].join('  •  ');

  const statusColor =
    serverStatus === 'online'
      ? SlickkColors.mint
      : serverStatus === 'offline'
        ? SlickkColors.danger
        : SlickkColors.amber;

  const statusLabel =
    serverStatus === 'online'
      ? 'Private tutor online'
      : serverStatus === 'offline'
        ? 'Private tutor offline'
        : 'Checking private tutor';

  const quickActions =
    useMemo<QuickAction[]>(
      () => [
        {
          id: 'live-tutor',
          title: 'Live Tutor',
          description:
            'Speak naturally and learn step by step.',
          icon: 'mic',
          accent: 'mint',
          open: () =>
            router.push({
              pathname: '/live-tutor',
              params: {
                subject: primarySubject,
              },
            }),
        },
        {
          id: 'camera-learning',
          title: 'Camera Learning',
          description:
            'Capture a page, diagram, or equation.',
          icon: 'camera',
          accent: 'blue',
          open: openCamera,
        },
        {
          id: 'homework',
          title: 'Homework Upload',
          description:
            'Choose images, PDFs, or documents.',
          icon: 'cloud-upload-outline',
          accent: 'amber',
          open: openHomework,
        },
        {
          id: 'typed-tutor',
          title: 'Typed Tutor',
          description:
            'Ask privately using text and materials.',
          icon: 'chatbubble-ellipses',
          accent: 'mint',
          open: () =>
            router.push({
              pathname: '/tutor',
              params: {
                subject: primarySubject,
              },
            }),
        },
      ],
      [primarySubject]
    );

  const learningTools: {
    id: string;
    label: string;
    detail: string;
    icon: IconName;
    open: () => void;
  }[] = [
    {
      id: 'learning-twin',
      label: 'Learning Twin',
      detail:
        'Verified strengths, gaps, and reviews',
      icon: 'analytics-outline',
      open: () =>
        router.push('/twin' as Href),
    },
    {
      id: 'learning-plan',
      label: 'My Learning Plan',
      detail:
        'Priorities based on real learning evidence',
      icon: 'sparkles-outline',
      open: () =>
        router.push('/learning-plan' as Href),
    },
    {
      id: 'weekly-test',
      label: 'Practice & Assessment',
      detail:
        'Check recent understanding',
      icon: 'document-text-outline',
      open: () =>
        router.push('/weekly-test' as Href),
    },
    {
      id: 'routine',
      label: 'Study Routine',
      detail:
        'Plan reminders and daily study',
      icon: 'calendar-outline',
      open: () =>
        router.push('/routine' as Href),
    },
    {
      id: 'parent',
      label: 'Parent Portal',
      detail:
        'Verified summaries and family support',
      icon: 'people-outline',
      open: () =>
        router.push('/parent-portal' as Href),
    },
    {
      id: 'privacy',
      label: 'Privacy & Server',
      detail:
        'Private connection and account access',
      icon: 'shield-checkmark-outline',
      open: () =>
        router.push('/access' as Href),
    },
  ];

  const selectMood = (
    mood: CheckInMood
  ) => {
    setSelectedMood(mood);

    Alert.alert(
      'How was school?',
      'Choose the closest answer. Slickk records only the selected learning categories.',
      [
        {
          text: 'Difficult',
          onPress: () =>
            void saveMood(
              mood,
              'difficult'
            ),
        },
        {
          text: 'Mixed',
          onPress: () =>
            void saveMood(mood, 'mixed'),
        },
        {
          text: 'Good',
          onPress: () =>
            void saveMood(mood, 'good'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const saveMood = async (
    mood: CheckInMood,
    schoolDay: SchoolDay
  ) => {
    if (savingMood) {
      return;
    }

    setSavingMood(true);

    try {
      const result = await submitDailyCheckIn({
        mood,
        schoolDay,
        needsTrustedAdult: false,
      });

      Alert.alert(
        `${result.suggestedMinutes}-minute plan`,
        result.response
      );
    } catch (error) {
      Alert.alert(
        'Check-in not saved',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSavingMood(false);
    }
  };

  const requestTrustedAdult = async () => {
    if (savingMood) {
      return;
    }

    setSavingMood(true);

    try {
      const result = await submitDailyCheckIn({
        mood: 'upset',
        schoolDay: 'difficult',
        needsTrustedAdult: true,
      });

      Alert.alert(
        'Please get human support now',
        result.response
      );
    } catch (error) {
      Alert.alert(
        'Support request not saved',
        error instanceof Error
          ? error.message
          : 'Please speak with a trusted adult now.'
      );
    } finally {
      setSavingMood(false);
    }
  };

  const translateY =
    entrance.interpolate({
      inputRange: [0, 1],
      outputRange: [14, 0],
    });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={
          SlickkColors.background
        }
      />

      <View style={styles.screen}>
        <Animated.View
          style={[
            styles.contentLayer,
            {
              opacity: entrance,
              transform: [{ translateY }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={
              styles.content
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() =>
                  void refresh()
                }
                tintColor={
                  SlickkColors.mint
                }
              />
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            <View style={styles.glowOne} />
            <View style={styles.glowTwo} />

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.date}>
                  {new Date()
                    .toLocaleDateString(
                      'en-US',
                      {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      }
                    )
                    .toUpperCase()}
                </Text>

                <Text style={styles.greeting}>
                  Learn with purpose,
                  {'\n'}
                  {firstName}.
                </Text>

                <Text style={styles.context}>
                  {schoolContext}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open student profile"
                onPress={() =>
                  router.push(
                    '/onboarding' as Href
                  )
                }
                style={({ pressed }) => [
                  styles.avatar,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.avatarText}>
                  {initials(fullName)}
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh private tutor status"
              onPress={() =>
                void checkServer()
              }
              style={({ pressed }) => [
                styles.statusPill,
                pressed && styles.pressed,
              ]}
            >
              {serverStatus ===
              'checking' ? (
                <ActivityIndicator
                  size="small"
                  color={statusColor}
                />
              ) : (
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        statusColor,
                    },
                  ]}
                />
              )}

              <Text
                style={[
                  styles.statusText,
                  {
                    color: statusColor,
                  },
                ]}
              >
                {statusLabel}
              </Text>

              <Ionicons
                name="refresh-outline"
                size={15}
                color={
                  SlickkColors.textMuted
                }
              />
            </Pressable>

            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View
                  style={styles.heroBadge}
                >
                  <Ionicons
                    name="sparkles"
                    size={14}
                    color={
                      SlickkColors.blackInk
                    }
                  />
                  <Text
                    style={styles.heroBadgeText}
                  >
                    MIND RIGHT LEARNING
                  </Text>
                </View>

                <View style={styles.privateBadge}>
                  <Ionicons
                    name="lock-closed"
                    size={13}
                    color={SlickkColors.mint}
                  />
                  <Text
                    style={styles.privateBadgeText}
                  >
                    PRIVATE
                  </Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>
                Your universal learning space
              </Text>

              <Text style={styles.heroText}>
                Ask, speak, photograph, upload,
                practise, and continue from your
                verified learning profile.
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/live-tutor',
                    params: {
                      subject:
                        primarySubject,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.heroButton,
                  pressed &&
                    styles.buttonPressed,
                ]}
              >
                <View
                  style={styles.heroButtonIcon}
                >
                  <Ionicons
                    name="mic"
                    size={21}
                    color={
                      SlickkColors.blackInk
                    }
                  />
                </View>

                <View
                  style={styles.heroButtonCopy}
                >
                  <Text
                    style={styles.heroButtonTitle}
                  >
                    Start Live Tutor
                  </Text>
                  <Text
                    style={styles.heroButtonText}
                  >
                    Begin with {primarySubject}
                  </Text>
                </View>

                <Ionicons
                  name="arrow-forward"
                  size={21}
                  color={
                    SlickkColors.blackInk
                  }
                />
              </Pressable>
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.eyebrow}>
                  LEARNING MODES
                </Text>
                <Text style={styles.sectionTitle}>
                  Choose how to learn
                </Text>
              </View>
            </View>

            <View style={styles.quickGrid}>
              {quickActions.map(
                (action) => {
                  const accentStyle =
                    action.accent === 'mint'
                      ? styles.accentMint
                      : action.accent ===
                          'blue'
                        ? styles.accentBlue
                        : styles.accentAmber;

                  const iconColor =
                    action.accent === 'mint'
                      ? SlickkColors.mint
                      : action.accent ===
                          'blue'
                        ? SlickkColors.blue
                        : SlickkColors.amber;

                  return (
                    <Pressable
                      key={action.id}
                      accessibilityRole="button"
                      accessibilityLabel={
                        action.title
                      }
                      onPress={action.open}
                      style={({ pressed }) => [
                        styles.quickCard,
                        pressed &&
                          styles.cardPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.quickIcon,
                          accentStyle,
                        ]}
                      >
                        <Ionicons
                          name={action.icon}
                          size={23}
                          color={iconColor}
                        />
                      </View>

                      <Text
                        style={styles.quickTitle}
                      >
                        {action.title}
                      </Text>

                      <Text
                        style={styles.quickText}
                      >
                        {action.description}
                      </Text>

                      <View
                        style={styles.quickArrow}
                      >
                        <Ionicons
                          name="arrow-forward"
                          size={17}
                          color={
                            SlickkColors.textSoft
                          }
                        />
                      </View>
                    </Pressable>
                  );
                }
              )}
            </View>

            <View style={styles.checkIn}>
              <View style={styles.checkInHeader}>
                <View
                  style={styles.checkInIcon}
                >
                  <Ionicons
                    name="heart-outline"
                    size={20}
                    color={SlickkColors.mint}
                  />
                </View>

                <View
                  style={styles.checkInCopy}
                >
                  <Text style={styles.eyebrow}>
                    DAILY CHECK-IN
                  </Text>
                  <Text
                    style={styles.checkInTitle}
                  >
                    How is your energy?
                  </Text>
                </View>
              </View>

              <View style={styles.moodRow}>
                {MOODS.map((mood) => {
                  const selected =
                    selectedMood === mood.id;

                  return (
                    <Pressable
                      key={mood.id}
                      disabled={savingMood}
                      onPress={() =>
                        selectMood(mood.id)
                      }
                      style={({ pressed }) => [
                        styles.mood,
                        selected &&
                          styles.moodSelected,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={mood.icon}
                        size={19}
                        color={
                          selected
                            ? SlickkColors
                                .blackInk
                            : SlickkColors.mint
                        }
                      />
                      <Text
                        style={[
                          styles.moodText,
                          selected &&
                            styles.moodTextSelected,
                        ]}
                      >
                        {mood.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                disabled={savingMood}
                onPress={() =>
                  void requestTrustedAdult()
                }
                style={({ pressed }) => [
                  styles.support,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="hand-left-outline"
                  size={17}
                  color={SlickkColors.amber}
                />
                <Text
                  style={styles.supportText}
                >
                  I need help from a trusted
                  adult now
                </Text>
              </Pressable>
            </View>

            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.eyebrow}>
                  YOUR LEARNING
                </Text>
                <Text style={styles.sectionTitle}>
                  Plan, practise, and review
                </Text>
              </View>
            </View>

            <View style={styles.tools}>
              {learningTools.map(
                (tool, index) => (
                  <Pressable
                    key={tool.id}
                    accessibilityRole="button"
                    onPress={tool.open}
                    style={({ pressed }) => [
                      styles.toolRow,
                      index ===
                        learningTools.length -
                          1 &&
                        styles.toolRowLast,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={styles.toolIcon}
                    >
                      <Ionicons
                        name={tool.icon}
                        size={21}
                        color={
                          SlickkColors.mint
                        }
                      />
                    </View>

                    <View
                      style={styles.toolCopy}
                    >
                      <Text
                        style={styles.toolLabel}
                      >
                        {tool.label}
                      </Text>
                      <Text
                        style={styles.toolDetail}
                      >
                        {tool.detail}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color={
                        SlickkColors.textMuted
                      }
                    />
                  </Pressable>
                )
              )}
            </View>

            <View style={styles.privacyNote}>
              <Ionicons
                name="shield-checkmark"
                size={19}
                color={SlickkColors.mint}
              />
              <Text
                style={styles.privacyNoteText}
              >
                Student learning data remains
                under your control and uses your
                connected Slickk server.
              </Text>
            </View>
          </ScrollView>
        </Animated.View>

        <SlickkBottomNav active="home" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SlickkColors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: SlickkColors.background,
  },
  contentLayer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SlickkSpace.large,
    paddingTop:
      Platform.OS === 'android' ? 10 : 18,
    paddingBottom: SlickkSpace.xxlarge,
    overflow: 'hidden',
  },
  glowOne: {
    position: 'absolute',
    top: -180,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor:
      'rgba(112, 247, 212, 0.075)',
  },
  glowTwo: {
    position: 'absolute',
    top: 420,
    left: -220,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor:
      'rgba(109, 168, 255, 0.045)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerCopy: {
    flex: 1,
  },
  date: {
    color: SlickkColors.mint,
    ...SlickkTypography.eyebrow,
  },
  greeting: {
    marginTop: 7,
    color: SlickkColors.text,
    ...SlickkTypography.title,
  },
  context: {
    marginTop: 7,
    color: SlickkColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SlickkColors.surfaceStrong,
    borderWidth: 1,
    borderColor: SlickkColors.borderStrong,
  },
  avatarText: {
    color: SlickkColors.mint,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  statusPill: {
    alignSelf: 'flex-start',
    minHeight: 34,
    marginTop: 17,
    paddingHorizontal: 12,
    borderRadius: SlickkRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SlickkColors.surfaceSoft,
    borderWidth: 1,
    borderColor: SlickkColors.border,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  hero: {
    marginTop: 18,
    padding: 20,
    borderRadius: SlickkRadius.xlarge,
    backgroundColor: '#0D2830',
    borderWidth: 1,
    borderColor: '#285B59',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroBadge: {
    minHeight: 29,
    paddingHorizontal: 10,
    borderRadius: SlickkRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SlickkColors.mint,
  },
  heroBadgeText: {
    color: SlickkColors.blackInk,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  privateBadge: {
    minHeight: 29,
    paddingHorizontal: 10,
    borderRadius: SlickkRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor:
      'rgba(112, 247, 212, 0.08)',
  },
  privateBadgeText: {
    color: SlickkColors.mint,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroTitle: {
    marginTop: 17,
    maxWidth: 310,
    color: SlickkColors.text,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: -0.55,
  },
  heroText: {
    marginTop: 9,
    maxWidth: 330,
    color: '#A0B8BA',
    ...SlickkTypography.body,
  },
  heroButton: {
    minHeight: 61,
    marginTop: 19,
    paddingHorizontal: 13,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: SlickkColors.mint,
  },
  heroButtonIcon: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(7, 20, 33, 0.10)',
  },
  heroButtonCopy: {
    flex: 1,
  },
  heroButtonTitle: {
    color: SlickkColors.blackInk,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
  heroButtonText: {
    marginTop: 2,
    color: '#315B58',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  sectionHeading: {
    marginTop: 28,
    marginBottom: 13,
  },
  eyebrow: {
    color: SlickkColors.mint,
    ...SlickkTypography.eyebrow,
  },
  sectionTitle: {
    marginTop: 4,
    color: SlickkColors.text,
    ...SlickkTypography.sectionTitle,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  quickCard: {
    width: '48.3%',
    minHeight: 174,
    padding: 15,
    borderRadius: SlickkRadius.large,
    backgroundColor: SlickkColors.surface,
    borderWidth: 1,
    borderColor: SlickkColors.border,
  },
  quickIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentMint: {
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },
  accentBlue: {
    backgroundColor:
      'rgba(109, 168, 255, 0.11)',
  },
  accentAmber: {
    backgroundColor:
      'rgba(255, 212, 122, 0.10)',
  },
  quickTitle: {
    marginTop: 15,
    color: SlickkColors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  quickText: {
    marginTop: 5,
    paddingRight: 6,
    color: SlickkColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '500',
  },
  quickArrow: {
    position: 'absolute',
    right: 14,
    bottom: 13,
  },
  checkIn: {
    marginTop: 21,
    padding: 17,
    borderRadius: SlickkRadius.large,
    backgroundColor: SlickkColors.surfaceSoft,
    borderWidth: 1,
    borderColor: SlickkColors.border,
  },
  checkInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  checkInIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },
  checkInCopy: {
    flex: 1,
  },
  checkInTitle: {
    marginTop: 2,
    color: SlickkColors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  moodRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  mood: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SlickkColors.surfaceStrong,
    borderWidth: 1,
    borderColor: SlickkColors.border,
  },
  moodSelected: {
    backgroundColor: SlickkColors.mint,
    borderColor: SlickkColors.mint,
  },
  moodText: {
    color: SlickkColors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  moodTextSelected: {
    color: SlickkColors.blackInk,
  },
  support: {
    minHeight: 43,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#241F18',
    borderWidth: 1,
    borderColor: '#65542E',
  },
  supportText: {
    color: '#FFE3A0',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  tools: {
    borderRadius: SlickkRadius.large,
    overflow: 'hidden',
    backgroundColor: SlickkColors.surfaceSoft,
    borderWidth: 1,
    borderColor: SlickkColors.border,
  },
  toolRow: {
    minHeight: 76,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor: SlickkColors.border,
  },
  toolRowLast: {
    borderBottomWidth: 0,
  },
  toolIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },
  toolCopy: {
    flex: 1,
  },
  toolLabel: {
    color: SlickkColors.text,
    ...SlickkTypography.label,
  },
  toolDetail: {
    marginTop: 3,
    color: SlickkColors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '500',
  },
  privacyNote: {
    marginTop: 18,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  privacyNoteText: {
    flex: 1,
    color: SlickkColors.textMuted,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.68,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
  },
  cardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
});
