import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const FEATURES = [
  {
    icon: 'mic-outline',
    title: 'Live AI Tutor',
    description: 'Natural voice lessons that adapt to how you learn.',
  },
  {
    icon: 'camera-outline',
    title: 'Camera Learning',
    description: 'Photograph questions, notes, books and handwriting.',
  },
  {
    icon: 'analytics-outline',
    title: 'Learning Twin',
    description: 'Tracks strengths, confusion and progress over time.',
  },
];

export default function SlickkWelcomeScreen() {
  const startLearning = () => {
    router.push('/onboarding');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />

        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons
              name="sparkles"
              size={28}
              color="#081426"
            />
          </View>

          <View>
            <Text style={styles.brand}>SLICKK</Text>

            <Text style={styles.brandSubtitle}>
              Your learning intelligence
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />

            <Text style={styles.badgeText}>
              AI SCHOOL FOR EVERY STUDENT
            </Text>
          </View>

          <Text style={styles.title}>
            A teacher who learns{' '}
            <Text style={styles.highlight}>
              how you think.
            </Text>
          </Text>

          <Text style={styles.subtitle}>
            Speak naturally, upload anything and learn through lessons built
            around your level, language and goals.
          </Text>

          <Pressable
            onPress={startLearning}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Start learning
            </Text>

            <Ionicons
              name="arrow-forward"
              size={21}
              color="#081426"
            />
          </Pressable>

          <Text style={styles.freeText}>
            Free foundation • English • বাংলা • Banglish
          </Text>
        </View>

        <View style={styles.featureSection}>
          <Text style={styles.sectionLabel}>
            BUILT DIFFERENTLY
          </Text>

          {FEATURES.map((feature) => (
            <View
              key={feature.title}
              style={styles.featureCard}
            >
              <View style={styles.featureIcon}>
                <Ionicons
                  name={
                    feature.icon as keyof typeof Ionicons.glyphMap
                  }
                  size={24}
                  color="#70F7D4"
                />
              </View>

              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>
                  {feature.title}
                </Text>

                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#66738A"
              />
            </View>
          ))}
        </View>

        <View style={styles.promiseCard}>
          <Ionicons
            name="shield-checkmark"
            size={24}
            color="#70F7D4"
          />

          <View style={styles.promiseText}>
            <Text style={styles.promiseTitle}>
              Private by design
            </Text>

            <Text style={styles.promiseDescription}>
              You control microphone access, saved lessons and learning data.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          SLICKK • LEARN BEYOND LIMITS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07101E',
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? 52 : 26,
    paddingBottom: 36,
    backgroundColor: '#07101E',
    overflow: 'hidden',
  },

  glowOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(40, 235, 194, 0.10)',
    top: -110,
    right: -90,
  },

  glowTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(63, 127, 255, 0.10)',
    top: 330,
    left: -130,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  brand: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2.5,
  },

  brandSubtitle: {
    color: '#8693A8',
    fontSize: 12,
    marginTop: 2,
  },

  hero: {
    marginTop: 55,
  },

  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#213047',
    backgroundColor: '#0D192A',
  },

  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#70F7D4',
  },

  badgeText: {
    color: '#A9B5C8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 43,
    lineHeight: 49,
    fontWeight: '900',
    letterSpacing: -1.7,
    marginTop: 22,
  },

  highlight: {
    color: '#70F7D4',
  },

  subtitle: {
    color: '#9EACC1',
    fontSize: 16,
    lineHeight: 25,
    marginTop: 18,
  },

  primaryButton: {
    height: 58,
    borderRadius: 18,
    marginTop: 30,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#70F7D4',
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },

  primaryButtonText: {
    color: '#081426',
    fontSize: 17,
    fontWeight: '900',
  },

  freeText: {
    color: '#718096',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 13,
  },

  featureSection: {
    marginTop: 46,
  },

  sectionLabel: {
    color: '#66738A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 14,
  },

  featureCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#17263B',
    backgroundColor: '#0B1727',
  },

  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  featureText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },

  featureTitle: {
    color: '#F5F8FC',
    fontSize: 16,
    fontWeight: '800',
  },

  featureDescription: {
    color: '#8492A8',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  promiseCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 18,
    marginTop: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E3A40',
    backgroundColor: '#0A2028',
  },

  promiseText: {
    flex: 1,
  },

  promiseTitle: {
    color: '#EAFDF8',
    fontSize: 15,
    fontWeight: '800',
  },

  promiseDescription: {
    color: '#89A6A6',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  footer: {
    color: '#445168',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 34,
  },
});