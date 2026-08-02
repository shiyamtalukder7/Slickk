import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useEffect,
  useState,
  type ComponentProps,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadStudentProfile } from '@/services/student-profile';

type IoniconName =
  ComponentProps<typeof Ionicons>['name'];

type Feature = {
  icon: IoniconName;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: 'school-outline',
    title: 'Personal AI Tutor',
    description:
      "Calm, step-by-step lessons adapted to the student's grade and understanding.",
  },
  {
    icon: 'calendar-outline',
    title: 'Daily Learning Routine',
    description:
      'Organized lessons, revision activities and upcoming study reminders.',
  },
  {
    icon: 'camera-outline',
    title: 'Learn From School Materials',
    description:
      'Photograph textbook pages, handwritten work and difficult questions.',
  },
  {
    icon: 'analytics-outline',
    title: 'Learning Twin',
    description:
      'Tracks progress, strengths, confusion and topics that need revision.',
  },
];

const LEARNING_STEPS = [
  {
    number: '01',
    title: 'Check in',
    description: 'Tell Slickk how you feel today.',
  },
  {
    number: '02',
    title: 'Start a lesson',
    description: 'Learn through text, voice or a textbook page.',
  },
  {
    number: '03',
    title: 'Review progress',
    description: 'Use routines, tests and adaptive feedback.',
  },
];

export default function SlickkWelcomeScreen() {
  const insets = useSafeAreaInsets();

  const [isCheckingProfile, setIsCheckingProfile] =
    useState(false);

  const [hasProfile, setHasProfile] =
    useState(false);

  useEffect(() => {
    let active = true;

    loadStudentProfile()
      .then((profile) => {
        if (active) {
          setHasProfile(Boolean(profile));
        }
      })
      .catch(() => {
        if (active) {
          setHasProfile(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const startLearning = async () => {
    if (isCheckingProfile) {
      return;
    }

    setIsCheckingProfile(true);

    try {
      const profile = await loadStudentProfile();

      router.push(
        profile
          ? '/explore'
          : '/onboarding'
      );
    } catch {
      router.push('/onboarding');
    } finally {
      setIsCheckingProfile(false);
    }
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
        },
      ]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: 18,
            paddingBottom:
              Math.max(insets.bottom, 18) + 26,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topGlow} />
        <View style={styles.sideGlow} />

        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons
                name="sparkles"
                size={24}
                color="#081426"
              />
            </View>

            <View>
              <Text style={styles.brand}>
                SLICKK
              </Text>

              <Text style={styles.brandSubtitle}>
                PRIVATE AI SCHOOL
              </Text>
            </View>
          </View>

          <View style={styles.privateBadge}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color="#70F7D4"
            />

            <Text style={styles.privateBadgeText}>
              LOCAL
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <View style={styles.heroBadgeDot} />

            <Text style={styles.heroBadgeText}>
              BUILT AROUND EACH STUDENT
            </Text>
          </View>

          <Text style={styles.heroTitle}>
            A personal teacher for{' '}
            <Text style={styles.heroHighlight}>
              every day.
            </Text>
          </Text>

          <Text style={styles.heroDescription}>
            Learn through conversation, school
            materials, daily routines and progress
            that adapts over time.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasProfile
                ? 'Continue learning'
                : 'Start learning'
            }
            disabled={isCheckingProfile}
            onPress={() => void startLearning()}
            style={({ pressed }) => [
              styles.primaryButton,
              isCheckingProfile &&
                styles.primaryButtonDisabled,
              pressed &&
                !isCheckingProfile &&
                styles.buttonPressed,
            ]}
          >
            <View style={styles.primaryButtonCopy}>
              <Text style={styles.primaryButtonText}>
                {isCheckingProfile
                  ? 'Opening your learning space'
                  : hasProfile
                    ? 'Continue learning'
                    : 'Start learning'}
              </Text>

              <Text
                style={
                  styles.primaryButtonDescription
                }
              >
                {hasProfile
                  ? 'Return to your Student Home'
                  : 'Create your student profile'}
              </Text>
            </View>

            {isCheckingProfile ? (
              <ActivityIndicator
                size="small"
                color="#081426"
              />
            ) : (
              <View style={styles.primaryButtonIcon}>
                <Ionicons
                  name="arrow-forward"
                  size={22}
                  color="#081426"
                />
              </View>
            )}
          </Pressable>

          <View style={styles.languageRow}>
            <Ionicons
              name="language-outline"
              size={17}
              color="#70F7D4"
            />

            <Text style={styles.languageText}>
              English | বাংলা | Banglish
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>
            YOUR LEARNING DAY
          </Text>

          <Text style={styles.sectionTitle}>
            Simple, guided and personal
          </Text>
        </View>

        <View style={styles.stepsCard}>
          {LEARNING_STEPS.map((step, index) => (
            <View
              key={step.number}
              style={styles.stepRow}
            >
              <View style={styles.stepTimeline}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>
                    {step.number}
                  </Text>
                </View>

                {index <
                LEARNING_STEPS.length - 1 ? (
                  <View style={styles.stepLine} />
                ) : null}
              </View>

              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>
                  {step.title}
                </Text>

                <Text
                  style={styles.stepDescription}
                >
                  {step.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>
            SLICKK LEARNING SYSTEM
          </Text>

          <Text style={styles.sectionTitle}>
            More than a chat screen
          </Text>
        </View>

        <View style={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <View
              key={feature.title}
              style={styles.featureCard}
            >
              <View style={styles.featureIcon}>
                <Ionicons
                  name={feature.icon}
                  size={23}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.featureTitle}>
                {feature.title}
              </Text>

              <Text
                style={styles.featureDescription}
              >
                {feature.description}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.trustCard}>
          <View style={styles.trustIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={25}
              color="#081426"
            />
          </View>

          <View style={styles.trustCopy}>
            <Text style={styles.trustTitle}>
              Private by design
            </Text>

            <Text style={styles.trustDescription}>
              Student profiles, learning history,
              microphone access and uploaded materials
              remain under the user's control.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Ionicons
            name="checkmark-circle"
            size={16}
            color="#70F7D4"
          />

          <Text style={styles.footerText}>
            Free learning foundation
          </Text>

          <View style={styles.footerDot} />

          <Text style={styles.footerText}>
            Local Slickk AI
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#07101E',
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },

  topGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -135,
    right: -120,
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  sideGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    top: 250,
    left: -165,
    backgroundColor:
      'rgba(45, 113, 190, 0.10)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 45,
    height: 45,
    borderRadius: 16,
    marginRight: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  brand: {
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  brandSubtitle: {
    marginTop: 2,
    color: '#71849B',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  privateBadge: {
    minHeight: 31,
    paddingHorizontal: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor:
      'rgba(112, 247, 212, 0.08)',
    borderWidth: 1,
    borderColor: '#24494A',
  },

  privateBadgeText: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  hero: {
    paddingTop: 45,
  },

  heroBadge: {
    alignSelf: 'flex-start',
    minHeight: 31,
    paddingHorizontal: 11,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#0C1D2D',
    borderWidth: 1,
    borderColor: '#20364D',
  },

  heroBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#70F7D4',
  },

  heroBadgeText: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  heroTitle: {
    marginTop: 20,
    color: '#FFFFFF',
    fontSize: 43,
    lineHeight: 50,
    fontWeight: '900',
    letterSpacing: -1.2,
  },

  heroHighlight: {
    color: '#70F7D4',
  },

  heroDescription: {
    marginTop: 17,
    color: '#99A8BA',
    fontSize: 17,
    lineHeight: 27,
  },

  primaryButton: {
    marginTop: 28,
    minHeight: 79,
    paddingHorizontal: 18,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#70F7D4',
  },

  primaryButtonDisabled: {
    opacity: 0.7,
  },

  primaryButtonCopy: {
    flex: 1,
  },

  primaryButtonText: {
    color: '#081426',
    fontSize: 18,
    fontWeight: '900',
  },

  primaryButtonDescription: {
    marginTop: 4,
    color: '#24413F',
    fontSize: 11,
    fontWeight: '600',
  },

  primaryButtonIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(8, 20, 38, 0.08)',
  },

  buttonPressed: {
    transform: [
      {
        scale: 0.985,
      },
    ],
  },

  languageRow: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  languageText: {
    color: '#71849B',
    fontSize: 12,
    fontWeight: '600',
  },

  sectionHeader: {
    marginTop: 43,
    marginBottom: 14,
  },

  sectionEyebrow: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  sectionTitle: {
    marginTop: 5,
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
  },

  stepsCard: {
    paddingHorizontal: 17,
    paddingTop: 18,
    paddingBottom: 4,
    borderRadius: 24,
    backgroundColor: '#0B1728',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  stepRow: {
    minHeight: 88,
    flexDirection: 'row',
  },

  stepTimeline: {
    width: 48,
    alignItems: 'center',
  },

  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
    borderWidth: 1,
    borderColor: '#28504F',
  },

  stepNumberText: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  stepLine: {
    flex: 1,
    width: 1,
    marginVertical: 5,
    backgroundColor: '#21364E',
  },

  stepCopy: {
    flex: 1,
    paddingLeft: 11,
    paddingTop: 2,
  },

  stepTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },

  stepDescription: {
    marginTop: 5,
    color: '#71849B',
    fontSize: 12,
    lineHeight: 18,
  },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  featureCard: {
    width: '48.4%',
    minHeight: 184,
    padding: 15,
    borderRadius: 22,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  featureTitle: {
    marginTop: 15,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },

  featureDescription: {
    marginTop: 7,
    color: '#71849B',
    fontSize: 11,
    lineHeight: 17,
  },

  trustCard: {
    marginTop: 24,
    padding: 17,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D2730',
    borderWidth: 1,
    borderColor: '#1F5A57',
  },

  trustIcon: {
    width: 49,
    height: 49,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  trustCopy: {
    flex: 1,
    marginLeft: 13,
  },

  trustTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  trustDescription: {
    marginTop: 5,
    color: '#8EA4A8',
    fontSize: 11,
    lineHeight: 17,
  },

  footer: {
    marginTop: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  footerText: {
    color: '#62748B',
    fontSize: 9,
    fontWeight: '700',
  },

  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#52657D',
  },
});
