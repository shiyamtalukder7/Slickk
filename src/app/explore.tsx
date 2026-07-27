import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const QUICK_TOOLS = [
  {
    icon: 'mic',
    title: 'Voice Tutor',
    subtitle: 'Speak naturally',
  },
  {
    icon: 'camera',
    title: 'Camera Learn',
    subtitle: 'Scan any question',
  },
  {
    icon: 'images',
    title: 'Upload Notes',
    subtitle: 'Images and documents',
  },
  {
    icon: 'bulb',
    title: 'Explain It',
    subtitle: 'Learn step by step',
  },
];

const SUBJECTS = [
  {
    icon: 'calculator',
    name: 'Mathematics',
  },
  {
    icon: 'flask',
    name: 'Science',
  },
  {
    icon: 'language',
    name: 'English',
  },
  {
    icon: 'earth',
    name: 'Social Studies',
  },
];

export default function SlickkDashboardScreen() {
  const showNextFeature = (feature: string) => {
    Alert.alert(
      feature,
      'This Slickk feature is prepared for the next development stage.'
    );
  };

  const openTutor = () => {
    router.push('/tutor');
  };

  const openLearningTwin = () => {
    router.push('/twin');
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
        <View style={styles.glow} />

        <View style={styles.header}>
          <View>
            <Text style={styles.smallGreeting}>WELCOME TO</Text>
            <Text style={styles.brand}>SLICKK</Text>
          </View>

          <Pressable
            onPress={() => showNextFeature('Student Profile')}
            style={({ pressed }) => [
              styles.profileButton,
              pressed && styles.cardPressed,
            ]}
          >
            <Ionicons
              name="person-outline"
              size={23}
              color="#70F7D4"
            />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />

            <Text style={styles.liveBadgeText}>
              YOUR AI TUTOR IS READY
            </Text>
          </View>

          <Text style={styles.heroTitle}>
            What would you like to{' '}
            <Text style={styles.highlight}>learn today?</Text>
          </Text>

          <Text style={styles.heroDescription}>
            Talk, type, upload a page or show Slickk what you are working on.
          </Text>

          <Pressable
            onPress={openTutor}
            style={({ pressed }) => [
              styles.liveButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.liveButtonIcon}>
              <Ionicons
                name="mic"
                size={24}
                color="#081426"
              />
            </View>

            <View style={styles.liveButtonText}>
              <Text style={styles.liveButtonTitle}>
                Start live lesson
              </Text>

              <Text style={styles.liveButtonSubtitle}>
                Voice, camera and interactive teaching
              </Text>
            </View>

            <Ionicons
              name="arrow-forward"
              size={22}
              color="#081426"
            />
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Quick learning tools
          </Text>

          <Pressable onPress={() => showNextFeature('All Tools')}>
            <Text style={styles.sectionAction}>View all</Text>
          </Pressable>
        </View>

        <View style={styles.toolsGrid}>
          {QUICK_TOOLS.map((tool) => (
            <Pressable
              key={tool.title}
              onPress={() => {
                if (
                  tool.title === 'Voice Tutor' ||
                  tool.title === 'Explain It'
                ) {
                  openTutor();
                  return;
                }

                showNextFeature(tool.title);
              }}
              style={({ pressed }) => [
                styles.toolCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.toolIcon}>
                <Ionicons
                  name={
                    tool.icon as keyof typeof Ionicons.glyphMap
                  }
                  size={25}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.toolTitle}>
                {tool.title}
              </Text>

              <Text style={styles.toolSubtitle}>
                {tool.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={openLearningTwin}
          style={({ pressed }) => [
            styles.learningTwinCard,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.twinHeader}>
            <View style={styles.twinIcon}>
              <Ionicons
                name="sparkles"
                size={24}
                color="#70F7D4"
              />
            </View>

            <View style={styles.twinHeading}>
              <Text style={styles.twinLabel}>
                LEARNING TWIN
              </Text>

              <Text style={styles.twinTitle}>
                Slickk is beginning to understand you
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#70F7D4"
            />
          </View>

          <Text style={styles.twinDescription}>
            Complete lessons and mastery checks to build your personalised
            learning intelligence.
          </Text>

          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              Profile intelligence
            </Text>

            <Text style={styles.progressValue}>12%</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>

          <View style={styles.twinStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Lessons</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>
                Skills mastered
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statValue}>1</Text>
              <Text style={styles.statLabel}>Day streak</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Continue by subject
          </Text>
        </View>

        <View style={styles.subjectList}>
          {SUBJECTS.map((subject) => (
            <Pressable
              key={subject.name}
              onPress={() => showNextFeature(subject.name)}
              style={({ pressed }) => [
                styles.subjectCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.subjectIcon}>
                <Ionicons
                  name={
                    subject.icon as keyof typeof Ionicons.glyphMap
                  }
                  size={23}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.subjectName}>
                {subject.name}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#65748A"
              />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => showNextFeature('Personal Study Plan')}
          style={({ pressed }) => [
            styles.planCard,
            pressed && styles.buttonPressed,
          ]}
        >
          <View style={styles.planIcon}>
            <Ionicons
              name="calendar"
              size={24}
              color="#081426"
            />
          </View>

          <View style={styles.planText}>
            <Text style={styles.planTitle}>
              Create today’s study plan
            </Text>

            <Text style={styles.planDescription}>
              Slickk will organise subjects, lessons and revision around your
              available time.
            </Text>
          </View>

          <Ionicons
            name="arrow-forward"
            size={21}
            color="#081426"
          />
        </Pressable>

        <View style={styles.privacyRow}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color="#6F829B"
          />

          <Text style={styles.privacyText}>
            Your lessons and Learning Twin data remain under your control.
          </Text>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 52 : 22,
    paddingBottom: 42,
    backgroundColor: '#07101E',
    overflow: 'hidden',
  },

  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -140,
    right: -100,
    backgroundColor: 'rgba(63, 230, 195, 0.09)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  smallGreeting: {
    color: '#718096',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },

  brand: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: 3,
  },

  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#213149',
    backgroundColor: '#0D192A',
  },

  heroCard: {
    padding: 21,
    marginTop: 28,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#1B3145',
    backgroundColor: '#0B1A2B',
  },

  liveBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#70F7D4',
  },

  liveBadgeText: {
    color: '#8EA0B6',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 18,
  },

  highlight: {
    color: '#70F7D4',
  },

  heroDescription: {
    color: '#95A4B9',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  liveButton: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 22,
    borderRadius: 20,
    backgroundColor: '#70F7D4',
  },

  liveButtonIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 20, 38, 0.10)',
  },

  liveButtonText: {
    flex: 1,
    marginHorizontal: 13,
  },

  liveButtonTitle: {
    color: '#081426',
    fontSize: 16,
    fontWeight: '900',
  },

  liveButtonSubtitle: {
    color: '#315B58',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 31,
    marginBottom: 14,
  },

  sectionTitle: {
    color: '#F2F6FC',
    fontSize: 18,
    fontWeight: '900',
  },

  sectionAction: {
    color: '#70F7D4',
    fontSize: 12,
    fontWeight: '800',
  },

  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  toolCard: {
    width: '48.3%',
    minHeight: 145,
    padding: 16,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#182A40',
    backgroundColor: '#0B1727',
  },

  toolIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  toolTitle: {
    color: '#F0F5FB',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 15,
  },

  toolSubtitle: {
    color: '#7F8EA4',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },

  learningTwinCard: {
    padding: 19,
    marginTop: 30,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1B4144',
    backgroundColor: '#0A222A',
  },

  twinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  twinIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#103139',
  },

  twinHeading: {
    flex: 1,
    marginLeft: 13,
  },

  twinLabel: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  twinTitle: {
    color: '#EDFFFB',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 3,
  },

  twinDescription: {
    color: '#86A0A5',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 15,
  },

  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 19,
  },

  progressLabel: {
    color: '#98AEB1',
    fontSize: 11,
    fontWeight: '700',
  },

  progressValue: {
    color: '#70F7D4',
    fontSize: 11,
    fontWeight: '900',
  },

  progressTrack: {
    height: 7,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#17363B',
    overflow: 'hidden',
  },

  progressFill: {
    width: '12%',
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#70F7D4',
  },

  twinStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },

  statLabel: {
    color: '#71868C',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
  },

  statDivider: {
    width: 1,
    height: 31,
    backgroundColor: '#1B4247',
  },

  subjectList: {
    gap: 11,
  },

  subjectCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#182A40',
    backgroundColor: '#0B1727',
  },

  subjectIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  subjectName: {
    flex: 1,
    color: '#EAF0F8',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 14,
  },

  planCard: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    marginTop: 30,
    borderRadius: 22,
    backgroundColor: '#70F7D4',
  },

  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 20, 38, 0.10)',
  },

  planText: {
    flex: 1,
    marginHorizontal: 13,
  },

  planTitle: {
    color: '#081426',
    fontSize: 15,
    fontWeight: '900',
  },

  planDescription: {
    color: '#315B58',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 23,
    paddingHorizontal: 15,
  },

  privacyText: {
    flexShrink: 1,
    color: '#5F7087',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
});