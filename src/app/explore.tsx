import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getSlickkApiUrl } from '@/config/api';
import {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from 'react';
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

type IoniconName =
  ComponentProps<typeof Ionicons>['name'];

type ServerStatus =
  | 'checking'
  | 'online'
  | 'offline';

type QuickTool = {
  id: string;
  icon: IoniconName;
  title: string;
  subtitle: string;
  action:
    | 'live-tutor'
    | 'typed-tutor'
    | 'camera'
    | 'upload';
};

type Subject = {
  id: string;
  icon: IoniconName;
  title: string;
  subtitle: string;
};

const QUICK_TOOLS: QuickTool[] = [
  {
    id: 'voice',
    icon: 'mic-outline',
    title: 'Live Tutor',
    subtitle: 'Hands-free conversation',
    action: 'live-tutor',
  },
  {
    id: 'typed',
    icon: 'chatbubble-ellipses-outline',
    title: 'Typed Tutor',
    subtitle: 'Ask and learn step by step',
    action: 'typed-tutor',
  },
  {
    id: 'camera',
    icon: 'camera-outline',
    title: 'Camera Learn',
    subtitle: 'Scan questions and notes',
    action: 'camera',
  },
  {
    id: 'upload',
    icon: 'document-text-outline',
    title: 'Upload Notes',
    subtitle: 'Learn from documents',
    action: 'upload',
  },
];

const SUBJECTS: Subject[] = [
  {
    id: 'mathematics',
    icon: 'calculator-outline',
    title: 'Mathematics',
    subtitle: 'Numbers, algebra and geometry',
  },
  {
    id: 'science',
    icon: 'flask-outline',
    title: 'Science',
    subtitle: 'Physics, chemistry and biology',
  },
  {
    id: 'english',
    icon: 'language-outline',
    title: 'English',
    subtitle: 'Reading, writing and grammar',
  },
  {
    id: 'social-studies',
    icon: 'earth-outline',
    title: 'Social Studies',
    subtitle: 'History, geography and society',
  },
];

function getStatusText(
  status: ServerStatus
) {
  switch (status) {
    case 'online':
      return 'LOCAL AI ONLINE';

    case 'offline':
      return 'LOCAL AI OFFLINE';

    default:
      return 'CHECKING LOCAL AI';
  }
}

function getStatusDescription(
  status: ServerStatus
) {
  switch (status) {
    case 'online':
      return 'Slickk intelligence is connected and ready.';

    case 'offline':
      return 'Start Ollama and the Slickk Node server on your laptop.';

    default:
      return 'Connecting to your private intelligence server.';
  }
}

export default function SlickkDashboardScreen() {
  const [serverStatus, setServerStatus] =
    useState<ServerStatus>('checking');

  const checkServer = useCallback(
    async () => {
      setServerStatus('checking');

      const controller =
        new AbortController();

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
    },
    []
  );

  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  const openLiveTutor = () => {
    router.push('/live-tutor');
  };

  const openTypedTutor = () => {
    router.push('/tutor');
  };

  const openLearningTwin = () => {
    router.push('/twin');
  };

  const openStudentProfile = () => {
    router.push('/onboarding');
  };

  const showComingSoon = (
    title: string,
    message: string
  ) => {
    Alert.alert(title, message);
  };

  const handleQuickTool = (
    tool: QuickTool
  ) => {
    switch (tool.action) {
      case 'live-tutor':
        openLiveTutor();
        return;

      case 'typed-tutor':
        openTypedTutor();
        return;

      case 'camera':
        showComingSoon(
          'Camera Learn',
          'Camera and handwriting understanding will be connected after the live voice system is verified.'
        );
        return;

      case 'upload':
        showComingSoon(
          'Upload Notes',
          'Document, image and lesson-material uploads are part of the next learning-content stage.'
        );
        return;

      default:
        return;
    }
  };

  const openSubject = (
    subject: Subject
  ) => {
    Alert.alert(
      subject.title,
      `Start a personalised ${subject.title} lesson with Slickk Tutor.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Typed lesson',
          onPress: openTypedTutor,
        },
        {
          text: 'Live lesson',
          onPress: openLiveTutor,
        },
      ]
    );
  };

  const openStudyPlan = () => {
    showComingSoon(
      'Adaptive Study Plan',
      'Slickk will generate personal lessons and revision schedules after the Learning Twin stores enough mastery evidence.'
    );
  };

  const statusColor =
    serverStatus === 'online'
      ? '#70F7D4'
      : serverStatus === 'offline'
        ? '#FF8E8E'
        : '#FFD36E';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <ScrollView
        contentContainerStyle={
          styles.container
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topGlow} />
        <View style={styles.sideGlow} />

        <View style={styles.header}>
          <View>
            <Text
              style={styles.smallGreeting}
            >
              WELCOME TO
            </Text>

            <Text style={styles.brand}>
              SLICKK
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open student profile"
            onPress={openStudentProfile}
            style={({ pressed }) => [
              styles.profileButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="person-outline"
              size={23}
              color="#70F7D4"
            />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check local AI connection"
          onPress={() =>
            void checkServer()
          }
          style={({ pressed }) => [
            styles.connectionCard,
            pressed && styles.pressed,
          ]}
        >
          <View
            style={[
              styles.connectionIcon,
              {
                borderColor: statusColor,
              },
            ]}
          >
            <View
              style={[
                styles.connectionDot,
                {
                  backgroundColor:
                    statusColor,
                },
              ]}
            />
          </View>

          <View
            style={
              styles.connectionContent
            }
          >
            <Text
              style={[
                styles.connectionTitle,
                {
                  color: statusColor,
                },
              ]}
            >
              {getStatusText(
                serverStatus
              )}
            </Text>

            <Text
              style={
                styles.connectionDescription
              }
            >
              {getStatusDescription(
                serverStatus
              )}
            </Text>
          </View>

          <Ionicons
            name="refresh-outline"
            size={21}
            color="#71849B"
          />
        </Pressable>

        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons
              name="sparkles"
              size={15}
              color="#70F7D4"
            />

            <Text
              style={styles.heroBadgeText}
            >
              ADAPTIVE PRIVATE TUTOR
            </Text>
          </View>

          <Text style={styles.heroTitle}>
            Learn through a{' '}
            <Text style={styles.highlight}>
              real conversation.
            </Text>
          </Text>

          <Text
            style={styles.heroDescription}
          >
            Speak naturally, ask follow-up
            questions and let Slickk adapt each
            explanation to your understanding.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start live lesson"
            onPress={openLiveTutor}
            style={({ pressed }) => [
              styles.liveButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <View
              style={
                styles.liveButtonIcon
              }
            >
              <Ionicons
                name="mic"
                size={25}
                color="#081426"
              />
            </View>

            <View
              style={
                styles.liveButtonContent
              }
            >
              <Text
                style={
                  styles.liveButtonTitle
                }
              >
                Start live lesson
              </Text>

              <Text
                style={
                  styles.liveButtonSubtitle
                }
              >
                Listen, respond and continue
                automatically
              </Text>
            </View>

            <Ionicons
              name="arrow-forward"
              size={22}
              color="#081426"
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open typed tutor"
            onPress={openTypedTutor}
            style={({ pressed }) => [
              styles.typedButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={20}
              color="#70F7D4"
            />

            <Text
              style={styles.typedButtonText}
            >
              Continue with typed tutor
            </Text>

            <Ionicons
              name="chevron-forward"
              size={19}
              color="#70F7D4"
            />
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              LEARNING SYSTEM
            </Text>

            <Text
              style={styles.sectionTitle}
            >
              Quick tools
            </Text>
          </View>

          <Pressable
            onPress={() =>
              showComingSoon(
                'Slickk Tools',
                'More learning tools will appear here as each development stage is completed.'
              )
            }
          >
            <Text
              style={styles.sectionAction}
            >
              View all
            </Text>
          </Pressable>
        </View>

        <View style={styles.toolsGrid}>
          {QUICK_TOOLS.map((tool) => (
            <Pressable
              key={tool.id}
              accessibilityRole="button"
              accessibilityLabel={tool.title}
              onPress={() =>
                handleQuickTool(tool)
              }
              style={({ pressed }) => [
                styles.toolCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.toolIcon}>
                <Ionicons
                  name={tool.icon}
                  size={25}
                  color="#70F7D4"
                />
              </View>

              <Text
                style={styles.toolTitle}
              >
                {tool.title}
              </Text>

              <Text
                style={
                  styles.toolSubtitle
                }
              >
                {tool.subtitle}
              </Text>

              <View
                style={styles.toolArrow}
              >
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#70F7D4"
                />
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Learning Twin"
          onPress={openLearningTwin}
          style={({ pressed }) => [
            styles.twinCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.twinTopRow}>
            <View style={styles.twinIcon}>
              <Ionicons
                name="analytics-outline"
                size={25}
                color="#70F7D4"
              />
            </View>

            <View
              style={styles.twinHeading}
            >
              <Text
                style={styles.twinLabel}
              >
                LEARNING TWIN
              </Text>

              <Text
                style={styles.twinTitle}
              >
                Your personal learning
                intelligence
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={22}
              color="#70F7D4"
            />
          </View>

          <Text
            style={styles.twinDescription}
          >
            Slickk tracks topics, skills,
            confusion signals and mastery
            evidence to choose what you should
            learn next.
          </Text>

          <View style={styles.progressHeader}>
            <Text
              style={styles.progressLabel}
            >
              Twin development
            </Text>

            <Text
              style={styles.progressValue}
            >
              12%
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={styles.progressFill}
            />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text
                style={styles.statValue}
              >
                0
              </Text>

              <Text
                style={styles.statLabel}
              >
                Lessons
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text
                style={styles.statValue}
              >
                0
              </Text>

              <Text
                style={styles.statLabel}
              >
                Mastered
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text
                style={styles.statValue}
              >
                1
              </Text>

              <Text
                style={styles.statLabel}
              >
                Day streak
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.sectionHeader}>
          <View>
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              CURRICULUM
            </Text>

            <Text
              style={styles.sectionTitle}
            >
              Choose a subject
            </Text>
          </View>
        </View>

        <View style={styles.subjectList}>
          {SUBJECTS.map((subject) => (
            <Pressable
              key={subject.id}
              accessibilityRole="button"
              accessibilityLabel={`Learn ${subject.title}`}
              onPress={() =>
                openSubject(subject)
              }
              style={({ pressed }) => [
                styles.subjectCard,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={styles.subjectIcon}
              >
                <Ionicons
                  name={subject.icon}
                  size={24}
                  color="#70F7D4"
                />
              </View>

              <View
                style={
                  styles.subjectContent
                }
              >
                <Text
                  style={
                    styles.subjectTitle
                  }
                >
                  {subject.title}
                </Text>

                <Text
                  style={
                    styles.subjectSubtitle
                  }
                >
                  {subject.subtitle}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={21}
                color="#62748B"
              />
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create adaptive study plan"
          onPress={openStudyPlan}
          style={({ pressed }) => [
            styles.studyPlanCard,
            pressed && styles.buttonPressed,
          ]}
        >
          <View
            style={styles.studyPlanIcon}
          >
            <Ionicons
              name="calendar-outline"
              size={25}
              color="#081426"
            />
          </View>

          <View
            style={
              styles.studyPlanContent
            }
          >
            <Text
              style={
                styles.studyPlanTitle
              }
            >
              Build today’s study plan
            </Text>

            <Text
              style={
                styles.studyPlanDescription
              }
            >
              Lessons, revision and mastery
              checks arranged around your time.
            </Text>
          </View>

          <Ionicons
            name="arrow-forward"
            size={22}
            color="#081426"
          />
        </Pressable>

        <View style={styles.privacyCard}>
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color="#70F7D4"
          />

          <View
            style={styles.privacyContent}
          >
            <Text
              style={styles.privacyTitle}
            >
              Private by design
            </Text>

            <Text
              style={
                styles.privacyDescription
              }
            >
              Your local tutor and Learning Twin
              remain under your control.
            </Text>
          </View>
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
    paddingTop:
      Platform.OS === 'android' ? 52 : 22,
    paddingBottom: 44,
    backgroundColor: '#07101E',
    overflow: 'hidden',
  },

  topGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -155,
    right: -110,
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  sideGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    top: 460,
    left: -185,
    backgroundColor:
      'rgba(64, 139, 255, 0.06)',
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
    letterSpacing: 1.7,
  },

  brand: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3.2,
    marginTop: 3,
  },

  profileButton: {
    width: 49,
    height: 49,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22344B',
    backgroundColor: '#0C192A',
  },

  connectionCard: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 25,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1A2C42',
    backgroundColor: '#0A1727',
  },

  connectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#101E2F',
  },

  connectionDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },

  connectionContent: {
    flex: 1,
    marginHorizontal: 12,
  },

  connectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  connectionDescription: {
    color: '#7F90A6',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  heroCard: {
    padding: 21,
    marginTop: 17,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#1C3448',
    backgroundColor: '#0A1A2B',
  },

  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#102B31',
  },

  heroBadgeText: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 31,
    lineHeight: 38,
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
    marginTop: 11,
  },

  liveButton: {
    minHeight: 75,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 22,
    borderRadius: 20,
    backgroundColor: '#70F7D4',
  },

  liveButtonIcon: {
    width: 47,
    height: 47,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(8, 20, 38, 0.11)',
  },

  liveButtonContent: {
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

  typedButton: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#235046',
    backgroundColor: '#0C282A',
  },

  typedButtonText: {
    flex: 1,
    color: '#C9FAEE',
    fontSize: 12,
    fontWeight: '800',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 14,
  },

  sectionEyebrow: {
    color: '#63768E',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
  },

  sectionTitle: {
    color: '#F3F7FC',
    fontSize: 19,
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
    minHeight: 157,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#192C42',
    backgroundColor: '#0A1727',
  },

  toolIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  toolTitle: {
    color: '#F2F6FC',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 14,
  },

  toolSubtitle: {
    color: '#7E8FA5',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  toolArrow: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 29,
    height: 29,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102B31',
  },

  twinCard: {
    padding: 19,
    marginTop: 30,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#1B4846',
    backgroundColor: '#092329',
  },

  twinTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  twinIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10343A',
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
    color: '#F0FFFC',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 3,
  },

  twinDescription: {
    color: '#8EA5A8',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 19,
  },

  progressLabel: {
    color: '#99AEB1',
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
    backgroundColor: '#18383C',
    overflow: 'hidden',
  },

  progressFill: {
    width: '12%',
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#70F7D4',
  },

  statsRow: {
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
    color: '#71878D',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
  },

  statDivider: {
    width: 1,
    height: 31,
    backgroundColor: '#1B4447',
  },

  subjectList: {
    gap: 11,
  },

  subjectCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#192C42',
    backgroundColor: '#0A1727',
  },

  subjectIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10283A',
  },

  subjectContent: {
    flex: 1,
    marginLeft: 14,
  },

  subjectTitle: {
    color: '#EDF3FA',
    fontSize: 15,
    fontWeight: '900',
  },

  subjectSubtitle: {
    color: '#71849A',
    fontSize: 11,
    marginTop: 4,
  },

  studyPlanCard: {
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    marginTop: 30,
    borderRadius: 23,
    backgroundColor: '#70F7D4',
  },

  studyPlanIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(8, 20, 38, 0.11)',
  },

  studyPlanContent: {
    flex: 1,
    marginHorizontal: 13,
  },

  studyPlanTitle: {
    color: '#081426',
    fontSize: 15,
    fontWeight: '900',
  },

  studyPlanDescription: {
    color: '#315B58',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginTop: 21,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#193343',
    backgroundColor: '#0A1B28',
  },

  privacyContent: {
    flex: 1,
    marginLeft: 11,
  },

  privacyTitle: {
    color: '#DCE8F0',
    fontSize: 12,
    fontWeight: '900',
  },

  privacyDescription: {
    color: '#63778C',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },

  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
