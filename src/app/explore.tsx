import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from 'react';
import {
  ActivityIndicator,
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

import { getSlickkApiUrl } from '@/config/api';
import {
  loadStudentProfile,
  type StudentEducationProfile,
} from '@/services/student-profile';

type IoniconName =
  ComponentProps<typeof Ionicons>['name'];

type ServerStatus =
  | 'checking'
  | 'online'
  | 'offline';

type Subject = {
  id: string;
  icon: IoniconName;
  title: string;
  subtitle: string;
};

type MoodOption = {
  id: string;
  icon: IoniconName;
  label: string;
};

type RoutineItem = {
  id: string;
  icon: IoniconName;
  title: string;
  subtitle: string;
};

const DEFAULT_SUBJECTS: Subject[] = [
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

const SUBJECT_DETAILS: Record<
  string,
  Pick<Subject, 'icon' | 'subtitle'>
> = {
  Mathematics: {
    icon: 'calculator-outline',
    subtitle: 'Numbers, algebra and geometry',
  },
  English: {
    icon: 'language-outline',
    subtitle: 'Reading, writing and grammar',
  },
  Bangla: {
    icon: 'book-outline',
    subtitle: 'Language, literature and writing',
  },
  Science: {
    icon: 'flask-outline',
    subtitle: 'Scientific ideas and investigation',
  },
  Physics: {
    icon: 'magnet-outline',
    subtitle: 'Matter, energy, forces and motion',
  },
  Chemistry: {
    icon: 'beaker-outline',
    subtitle: 'Materials, reactions and experiments',
  },
  Biology: {
    icon: 'leaf-outline',
    subtitle: 'Living systems and the environment',
  },
  'Higher Mathematics': {
    icon: 'stats-chart-outline',
    subtitle: 'Advanced mathematics',
  },
  Accounting: {
    icon: 'receipt-outline',
    subtitle: 'Financial records and reporting',
  },
  Economics: {
    icon: 'trending-up-outline',
    subtitle: 'Markets, choices and development',
  },
  History: {
    icon: 'time-outline',
    subtitle: 'People, events and evidence',
  },
  'Geography and Environment': {
    icon: 'earth-outline',
    subtitle: 'Places, people and environment',
  },
  'Information and Communication Technology': {
    icon: 'laptop-outline',
    subtitle: 'Computing and digital systems',
  },
};

const MOOD_OPTIONS: MoodOption[] = [
  {
    id: 'great',
    icon: 'happy-outline',
    label: 'Great',
  },
  {
    id: 'okay',
    icon: 'remove-circle-outline',
    label: 'Okay',
  },
  {
    id: 'tired',
    icon: 'moon-outline',
    label: 'Tired',
  },
];

export default function SlickkDashboardScreen() {
  const insets = useSafeAreaInsets();

  const [serverStatus, setServerStatus] =
    useState<ServerStatus>('checking');

  const [studentProfile, setStudentProfile] =
    useState<StudentEducationProfile | null>(null);

  const [selectedMood, setSelectedMood] =
    useState<string | null>(null);

  const [routineDone, setRoutineDone] =
    useState<Record<string, boolean>>({});

  const dashboardSubjects = useMemo(() => {
    if (!studentProfile?.subjects.length) {
      return DEFAULT_SUBJECTS;
    }

    return studentProfile.subjects.map((title) => {
      const details = SUBJECT_DETAILS[title];

      return {
        id: title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-'),
        title,
        icon: details?.icon ?? 'school-outline',
        subtitle:
          details?.subtitle ??
          `Personalized ${title} lessons`,
      };
    });
  }, [studentProfile]);

  const nextSubject =
    dashboardSubjects[0] ?? DEFAULT_SUBJECTS[0];

  const routineItems = useMemo<RoutineItem[]>(
    () => [
      {
        id: 'lesson',
        icon: 'school-outline',
        title: `${nextSubject.title} lesson`,
        subtitle: '20 minute guided lesson',
      },
      {
        id: 'materials',
        icon: 'camera-outline',
        title: 'Review school materials',
        subtitle: 'Upload one page or question',
      },
      {
        id: 'revision',
        icon: 'refresh-outline',
        title: 'Quick revision',
        subtitle: '5 minute understanding check',
      },
    ],
    [nextSubject.title]
  );

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

  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  useEffect(() => {
    let active = true;

    loadStudentProfile()
      .then((profile) => {
        if (active) {
          setStudentProfile(profile);
        }
      })
      .catch(() => {
        // The dashboard remains usable offline.
      });

    return () => {
      active = false;
    };
  }, []);

  const openTypedTutor = (subject?: string) => {
    if (subject) {
      router.push({
        pathname: '/tutor',
        params: {
          subject,
        },
      });

      return;
    }

    router.push('/tutor');
  };

  const openLiveTutor = (subject?: string) => {
    if (subject) {
      router.push({
        pathname: '/live-tutor',
        params: {
          subject,
        },
      });

      return;
    }

    router.push('/live-tutor');
  };

  const openCamera = () => {
    router.push({
      pathname: '/camera-learn',
      params: {
        mode: 'camera',
      },
    });
  };

  const openProgress = () => {
    router.push('/twin');
  };

  const openProfile = () => {
    router.push('/onboarding');
  };

  const openAccess = () => {
    router.push('/access' as Href);
  };

  const showRoutineSetup = () => {
    router.push('/routine' as Href);
  };

  const showWeeklyTest = () => {
    router.push('/weekly-test' as Href);
  };

  const showParentPortal = () => {
    router.push('/parent-portal' as Href);
  };

  const selectMood = (mood: MoodOption) => {
    setSelectedMood(mood.id);

    const message =
      mood.id === 'great'
        ? 'That is wonderful. Let us use that energy for a strong lesson.'
        : mood.id === 'tired'
          ? 'Thank you for telling me. Slickk will keep the next activity calm and manageable.'
          : 'Thank you for checking in. We will take today one step at a time.';

    Alert.alert(
      `You feel ${mood.label.toLowerCase()}`,
      message
    );
  };

  const toggleRoutineItem = (itemId: string) => {
    setRoutineDone((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  };

  const completedRoutineCount =
    routineItems.filter(
      (item) => routineDone[item.id]
    ).length;

  const firstName =
    studentProfile?.studentName
      .trim()
      .split(/\s+/)[0] || 'Student';

  const grade =
    studentProfile?.grade || 'Class 7';

  const schoolName =
    studentProfile?.school?.name || 'Your school';

  const todayLabel = new Date().toLocaleDateString(
    'en-US',
    {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }
  );

  const serverColor =
    serverStatus === 'online'
      ? '#70F7D4'
      : serverStatus === 'offline'
        ? '#FF8E8E'
        : '#FFD36E';

  const serverLabel =
    serverStatus === 'online'
      ? 'Local AI ready'
      : serverStatus === 'offline'
        ? 'Local AI offline'
        : 'Checking local AI';

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          paddingTop:
            Platform.OS === 'android'
              ? insets.top
              : 0,
        },
      ]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topGlow} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.dateText}>
                {todayLabel.toUpperCase()}
              </Text>

              <Text style={styles.greeting}>
                Hi, {firstName}
              </Text>

              <Text style={styles.profileContext}>
                {grade} | {schoolName}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open student profile"
              onPress={openProfile}
              style={({ pressed }) => [
                styles.profileButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="person-outline"
                size={24}
                color="#70F7D4"
              />
            </Pressable>
          </View>

          <Pressable
            onPress={() => void checkServer()}
            style={({ pressed }) => [
              styles.serverPill,
              pressed && styles.pressed,
            ]}
          >
            {serverStatus === 'checking' ? (
              <ActivityIndicator
                size="small"
                color={serverColor}
              />
            ) : (
              <View
                style={[
                  styles.serverDot,
                  {
                    backgroundColor: serverColor,
                  },
                ]}
              />
            )}

            <Text
              style={[
                styles.serverText,
                {
                  color: serverColor,
                },
              ]}
            >
              {serverLabel}
            </Text>

            <Ionicons
              name="refresh-outline"
              size={16}
              color="#71849B"
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open secure server access"
            onPress={openAccess}
            style={({ pressed }) => [
              styles.accessCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.accessCardIcon}>
              <Ionicons
                name="key-outline"
                size={20}
                color="#70F7D4"
              />
            </View>

            <View style={styles.accessCardCopy}>
              <Text style={styles.accessCardTitle}>
                Secure server access
              </Text>

              <Text style={styles.accessCardText}>
                Verify or replace this student?s access key
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={19}
              color="#71849B"
            />
          </Pressable>

          <View style={styles.checkInCard}>
            <View style={styles.cardTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons
                  name="heart-outline"
                  size={21}
                  color="#70F7D4"
                />
              </View>

              <View style={styles.cardTitleContent}>
                <Text style={styles.eyebrow}>
                  DAILY CHECK-IN
                </Text>

                <Text style={styles.cardTitle}>
                  How are you doing today?
                </Text>
              </View>
            </View>

            <Text style={styles.cardDescription}>
              Tell Slickk how you feel before starting
              your lessons.
            </Text>

            <View style={styles.moodRow}>
              {MOOD_OPTIONS.map((mood) => {
                const isSelected =
                  selectedMood === mood.id;

                return (
                  <Pressable
                    key={mood.id}
                    onPress={() => selectMood(mood)}
                    style={({ pressed }) => [
                      styles.moodButton,
                      isSelected &&
                        styles.moodButtonSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={mood.icon}
                      size={21}
                      color={
                        isSelected
                          ? '#081426'
                          : '#70F7D4'
                      }
                    />

                    <Text
                      style={[
                        styles.moodText,
                        isSelected &&
                          styles.moodTextSelected,
                      ]}
                    >
                      {mood.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.nextLessonCard}>
            <View style={styles.nextLessonTop}>
              <View>
                <Text style={styles.nextLabel}>
                  NEXT LESSON
                </Text>

                <Text style={styles.nextSubject}>
                  {nextSubject.title}
                </Text>
              </View>

              <View style={styles.readyBadge}>
                <View style={styles.readyDot} />

                <Text style={styles.readyText}>
                  READY
                </Text>
              </View>
            </View>

            <Text style={styles.nextDescription}>
              Start a calm, curriculum-guided lesson
              based on your grade and school profile.
            </Text>

            <View style={styles.lessonActions}>
              <Pressable
                onPress={() =>
                  openTypedTutor(nextSubject.title)
                }
                style={({ pressed }) => [
                  styles.primaryLessonButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color="#081426"
                />

                <Text style={styles.primaryButtonText}>
                  Start lesson
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={19}
                  color="#081426"
                />
              </Pressable>

              <Pressable
                onPress={() =>
                  openLiveTutor(nextSubject.title)
                }
                style={({ pressed }) => [
                  styles.voiceLessonButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="mic-outline"
                  size={21}
                  color="#70F7D4"
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>
                DAILY ROUTINE
              </Text>

              <Text style={styles.sectionTitle}>
                Today&apos;s learning plan
              </Text>
            </View>

            <Pressable onPress={showRoutineSetup}>
              <Text style={styles.sectionAction}>
                Edit
              </Text>
            </Pressable>
          </View>

          <View style={styles.routineCard}>
            <View style={styles.routineProgressRow}>
              <Text style={styles.routineProgressText}>
                {completedRoutineCount} of{' '}
                {routineItems.length} complete
              </Text>

              <Text style={styles.routinePercentage}>
                {Math.round(
                  (completedRoutineCount /
                    routineItems.length) *
                    100
                )}
                %
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      (completedRoutineCount /
                        routineItems.length) *
                      100
                    }%`,
                  },
                ]}
              />
            </View>

            {routineItems.map((item) => {
              const isDone =
                Boolean(routineDone[item.id]);

              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    toggleRoutineItem(item.id)
                  }
                  style={({ pressed }) => [
                    styles.routineItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.routineCheck,
                      isDone &&
                        styles.routineCheckDone,
                    ]}
                  >
                    <Ionicons
                      name={
                        isDone
                          ? 'checkmark'
                          : item.icon
                      }
                      size={18}
                      color={
                        isDone
                          ? '#081426'
                          : '#70F7D4'
                      }
                    />
                  </View>

                  <View style={styles.routineContent}>
                    <Text
                      style={[
                        styles.routineTitle,
                        isDone &&
                          styles.routineTitleDone,
                      ]}
                    >
                      {item.title}
                    </Text>

                    <Text style={styles.routineSubtitle}>
                      {item.subtitle}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color="#52657D"
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>
                LEARNING TOOLS
              </Text>

              <Text style={styles.sectionTitle}>
                Continue learning
              </Text>
            </View>
          </View>

          <View style={styles.actionGrid}>
            <Pressable
              onPress={() => openTypedTutor()}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name="school-outline"
                  size={24}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.actionTitle}>
                AI Tutor
              </Text>

              <Text style={styles.actionSubtitle}>
                Learn step by step
              </Text>
            </Pressable>

            <Pressable
              onPress={openCamera}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name="camera-outline"
                  size={24}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.actionTitle}>
                Camera Learn
              </Text>

              <Text style={styles.actionSubtitle}>
                Scan a book page
              </Text>
            </Pressable>

            <Pressable
              onPress={showWeeklyTest}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={24}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.actionTitle}>
                Weekly Test
              </Text>

              <Text style={styles.actionSubtitle}>
                Test recent topics
              </Text>
            </Pressable>

            <Pressable
              onPress={openProgress}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionIcon}>
                <Ionicons
                  name="analytics-outline"
                  size={24}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.actionTitle}>
                Progress
              </Text>

              <Text style={styles.actionSubtitle}>
                View your Learning Twin
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={openProgress}
            style={({ pressed }) => [
              styles.progressCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.progressCardIcon}>
              <Ionicons
                name="analytics-outline"
                size={25}
                color="#081426"
              />
            </View>

            <View style={styles.progressCardContent}>
              <Text style={styles.eyebrow}>
                LEARNING PROGRESS
              </Text>

              <Text style={styles.progressCardTitle}>
                Your Learning Twin is getting ready
              </Text>

              <Text style={styles.progressCardText}>
                Complete lessons and understanding
                checks to reveal strengths and topics
                that need revision.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color="#70F7D4"
            />
          </Pressable>

          <Pressable
            onPress={showParentPortal}
            style={({ pressed }) => [
              styles.parentCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.parentIcon}>
              <Ionicons
                name="people-outline"
                size={23}
                color="#70F7D4"
              />
            </View>

            <View style={styles.parentContent}>
              <Text style={styles.parentTitle}>
                Parent Portal
              </Text>

              <Text style={styles.parentDescription}>
                Reports, class alerts and test results
                will appear here.
              </Text>
            </View>

            <View style={styles.soonBadge}>
              <Text style={styles.soonText}>
                OPEN
              </Text>
            </View>
          </Pressable>

          <View style={styles.privacyRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={18}
              color="#70F7D4"
            />

            <Text style={styles.privacyText}>
              Student learning data remains under your
              control.
            </Text>
          </View>
        </ScrollView>

        <View
          style={[
            styles.bottomNavigation,
            {
              paddingBottom: Math.max(
                insets.bottom,
                12
              ),
              minHeight:
                67 +
                Math.max(
                  insets.bottom,
                  12
                ),
            },
          ]}
        >
          <Pressable style={styles.navItemActive}>
            <Ionicons
              name="home"
              size={22}
              color="#081426"
            />

            <Text style={styles.navTextActive}>
              Home
            </Text>
          </Pressable>

          <Pressable
            onPress={() => openTypedTutor()}
            style={styles.navItem}
          >
            <Ionicons
              name="school-outline"
              size={22}
              color="#71849B"
            />

            <Text style={styles.navText}>
              Learn
            </Text>
          </Pressable>

          <Pressable
            onPress={showRoutineSetup}
            style={styles.navItem}
          >
            <Ionicons
              name="calendar-outline"
              size={22}
              color="#71849B"
            />

            <Text style={styles.navText}>
              Routine
            </Text>
          </Pressable>

          <Pressable
            onPress={openProgress}
            style={styles.navItem}
          >
            <Ionicons
              name="analytics-outline"
              size={22}
              color="#71849B"
            />

            <Text style={styles.navText}>
              Progress
            </Text>
          </Pressable>

          <Pressable
            onPress={openProfile}
            style={styles.navItem}
          >
            <Ionicons
              name="person-outline"
              size={22}
              color="#71849B"
            />

            <Text style={styles.navText}>
              Profile
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07101E',
  },

  screen: {
    flex: 1,
    backgroundColor: '#07101E',
  },

  container: {
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === 'android' ? 10 : 16,
    paddingBottom: 38,
    overflow: 'hidden',
  },

  topGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor:
      'rgba(61, 241, 200, 0.07)',
    top: -160,
    right: -110,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerText: {
    flex: 1,
    paddingRight: 14,
  },

  dateText: {
    color: '#70F7D4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  greeting: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
  },

  profileContext: {
    marginTop: 4,
    color: '#8A9AAF',
    fontSize: 14,
    lineHeight: 20,
  },

  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1A2C',
    borderWidth: 1,
    borderColor: '#20324A',
  },

  pressed: {
    opacity: 0.72,
  },

  buttonPressed: {
    transform: [
      {
        scale: 0.98,
      },
    ],
  },

  serverPill: {
    marginTop: 18,
    alignSelf: 'flex-start',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1A2D45',
  },

  serverDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  serverText: {
    fontSize: 12,
    fontWeight: '700',
  },

  checkInCard: {
    marginTop: 18,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1C3048',
  },

  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },

  cardTitleContent: {
    flex: 1,
    marginLeft: 12,
  },

  eyebrow: {
    color: '#70F7D4',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.4,
  },

  cardTitle: {
    marginTop: 3,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },

  cardDescription: {
    marginTop: 13,
    color: '#8A9AAF',
    fontSize: 14,
    lineHeight: 21,
  },

  moodRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 9,
  },

  moodButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 9,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#101F32',
    borderWidth: 1,
    borderColor: '#22364E',
  },

  moodButtonSelected: {
    backgroundColor: '#70F7D4',
    borderColor: '#70F7D4',
  },

  moodText: {
    color: '#D9E4EE',
    fontSize: 13,
    fontWeight: '700',
  },

  moodTextSelected: {
    color: '#081426',
  },

  nextLessonCard: {
    marginTop: 16,
    padding: 20,
    borderRadius: 27,
    backgroundColor: '#0D2730',
    borderWidth: 1,
    borderColor: '#1F5A57',
  },

  nextLessonTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  nextLabel: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  nextSubject: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
  },

  readyBadge: {
    minHeight: 29,
    paddingHorizontal: 10,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },

  readyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#70F7D4',
  },

  readyText: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  nextDescription: {
    marginTop: 12,
    color: '#A0B4B7',
    fontSize: 14,
    lineHeight: 21,
  },

  lessonActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },

  primaryLessonButton: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#70F7D4',
  },

  primaryButtonText: {
    flex: 1,
    color: '#081426',
    fontSize: 15,
    fontWeight: '800',
  },

  voiceLessonButton: {
    width: 54,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102C35',
    borderWidth: 1,
    borderColor: '#285C5C',
  },

  sectionHeading: {
    marginTop: 27,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
  },

  sectionAction: {
    color: '#70F7D4',
    fontSize: 13,
    fontWeight: '700',
  },

  routineCard: {
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 5,
    borderRadius: 23,
    backgroundColor: '#0B1728',
    borderWidth: 1,
    borderColor: '#1D2F46',
  },

  routineProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  routineProgressText: {
    color: '#AAB7C7',
    fontSize: 12,
    fontWeight: '600',
  },

  routinePercentage: {
    color: '#70F7D4',
    fontSize: 12,
    fontWeight: '800',
  },

  progressTrack: {
    marginTop: 10,
    marginBottom: 7,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#17273B',
  },

  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#70F7D4',
  },

  routineItem: {
    minHeight: 73,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#17283D',
  },

  routineCheck: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102137',
    borderWidth: 1,
    borderColor: '#27415E',
  },

  routineCheckDone: {
    backgroundColor: '#70F7D4',
    borderColor: '#70F7D4',
  },

  routineContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  routineTitle: {
    color: '#EFF5F8',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },

  routineTitleDone: {
    color: '#728398',
    textDecorationLine: 'line-through',
  },

  routineSubtitle: {
    marginTop: 2,
    color: '#71849B',
    fontSize: 12,
    lineHeight: 17,
  },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  actionCard: {
    width: '48.4%',
    minHeight: 145,
    padding: 15,
    borderRadius: 21,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  actionIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  actionTitle: {
    marginTop: 15,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  actionSubtitle: {
    marginTop: 5,
    color: '#71849B',
    fontSize: 12,
    lineHeight: 17,
  },

  progressCard: {
    marginTop: 22,
    padding: 17,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1C2D',
    borderWidth: 1,
    borderColor: '#24415A',
  },

  progressCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  progressCardContent: {
    flex: 1,
    marginHorizontal: 13,
  },

  progressCardTitle: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },

  progressCardText: {
    marginTop: 6,
    color: '#7F91A7',
    fontSize: 12,
    lineHeight: 18,
  },

  parentCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1728',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  parentIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  parentContent: {
    flex: 1,
    marginHorizontal: 12,
  },

  parentTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  parentDescription: {
    marginTop: 4,
    color: '#71849B',
    fontSize: 12,
    lineHeight: 18,
  },

  soonBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  soonText: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  privacyRow: {
    marginTop: 22,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  privacyText: {
    flex: 1,
    color: '#61748B',
    fontSize: 11,
    lineHeight: 17,
  },

  bottomNavigation: {
    minHeight: 76,
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom:
      Platform.OS === 'android' ? 9 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#091525',
    borderTopWidth: 1,
    borderTopColor: '#1A2B40',
  },

  navItem: {
    minWidth: 57,
    height: 55,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  navItemActive: {
    minWidth: 61,
    height: 55,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#70F7D4',
  },

  navText: {
    color: '#71849B',
    fontSize: 10,
    fontWeight: '700',
  },

  navTextActive: {
    color: '#081426',
    fontSize: 10,
    fontWeight: '800',
  },

  accessCard: {
    minHeight: 66,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1C3048',
  },

  accessCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102237',
  },

  accessCardCopy: {
    flex: 1,
  },

  accessCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  accessCardText: {
    marginTop: 3,
    color: '#7F91A7',
    fontSize: 11,
    lineHeight: 16,
  },

});
