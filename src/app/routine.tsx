import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useEffect,
  useMemo,
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
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  loadStudentProfile,
  type StudentEducationProfile,
} from '@/services/student-profile';
import {
  cancelRoutineReminders,
  loadRoutineState,
  saveRoutineState,
  scheduleRoutineReminders,
  type RoutineState,
} from '@/services/routine';

type IoniconName =
  ComponentProps<typeof Ionicons>['name'];

type RoutineActivity = {
  id: string;
  icon: IoniconName;
  time: string;
  title: string;
  subtitle: string;
  duration: string;
};

const ROUTINE_ACTIVITIES: RoutineActivity[] = [
  {
    id: 'biology',
    icon: 'leaf-outline',
    time: '4:00 PM',
    title: 'Biology lesson',
    subtitle: "Review today's school chapter",
    duration: '20 min',
  },
  {
    id: 'materials',
    icon: 'camera-outline',
    time: '4:25 PM',
    title: 'Textbook review',
    subtitle: 'Upload one page or difficult question',
    duration: '10 min',
  },
  {
    id: 'revision',
    icon: 'refresh-outline',
    time: '4:40 PM',
    title: 'Quick revision',
    subtitle: 'Answer a short understanding check',
    duration: '5 min',
  },
];

export default function RoutineScreen() {
  const insets = useSafeAreaInsets();

  const [studentProfile, setStudentProfile] =
    useState<StudentEducationProfile | null>(null);

  const [remindersEnabled, setRemindersEnabled] =
    useState(true);

  const [completed, setCompleted] =
    useState<Record<string, boolean>>({});

  const [routineState, setRoutineState] =
    useState<RoutineState | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    Promise.all([loadStudentProfile(), loadRoutineState()])
      .then(([profile, savedRoutine]) => {
        if (!isMounted) return;
        setStudentProfile(profile);
        setRoutineState(savedRoutine);
        setCompleted(savedRoutine.completed);
        setRemindersEnabled(savedRoutine.remindersEnabled);
      })
      .catch((error) => {
        console.error(
          'Unable to load Routine profile:',
          error
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const primarySubject =
    studentProfile?.subjects
      ?.map((subject) => subject.trim())
      .find(Boolean) ||
    'General Studies';

  const primarySubjectIcon: IoniconName =
    primarySubject.toLowerCase().includes('math')
      ? 'calculator-outline'
      : primarySubject.toLowerCase().includes('biology')
        ? 'leaf-outline'
        : 'book-outline';

  const routineActivities = useMemo(
    () =>
      ROUTINE_ACTIVITIES.map((activity, index) =>
        index === 0
          ? {
              ...activity,
              icon: primarySubjectIcon,
              title: `${primarySubject} lesson`,
              subtitle:
                "Review today's school chapter",
            }
          : activity
      ),
    [primarySubject, primarySubjectIcon]
  );

  const completedCount = useMemo(
    () =>
      routineActivities.filter(
        (activity) => completed[activity.id]
      ).length,
    [completed, routineActivities]
  );

  const progress =
    routineActivities.length > 0
      ? completedCount /
        routineActivities.length
      : 0;

  const toggleActivity = (activityId: string) => {
    setCompleted((current) => {
      const next = {
        ...current,
        [activityId]: !current[activityId],
      };
      if (routineState) {
        const nextState = { ...routineState, completed: next };
        setRoutineState(nextState);
        void saveRoutineState(nextState);
      }
      return next;
    });
  };

  const saveRoutine = async () => {
    if (!routineState || isSaving) return;
    setIsSaving(true);

    try {
      const notificationIds = remindersEnabled
        ? await scheduleRoutineReminders(
            routineActivities,
            routineState.notificationIds
          )
        : (await cancelRoutineReminders(routineState.notificationIds), []);

      const nextState = {
        ...routineState,
        completed,
        remindersEnabled,
        notificationIds,
      };
      await saveRoutineState(nextState);
      setRoutineState(nextState);
      Alert.alert(
        'Routine saved',
        remindersEnabled
          ? 'Daily five-minute reminders are active for all three learning activities.'
          : 'Your routine is saved without reminder alerts.'
      );
    } catch (error) {
      Alert.alert(
        'Unable to schedule reminders',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to Student Home"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color="#FFFFFF"
            />
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>
              STUDENT ROUTINE
            </Text>

            <Text style={styles.headerTitle}>
              Daily learning plan
            </Text>
          </View>

          <View style={styles.addButton}>
            <Ionicons
              name="notifications-outline"
              size={23}
              color="#081426"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.eyebrow}>
                  TODAY
                </Text>

                <Text style={styles.heroTitle}>
                  Your study routine
                </Text>
              </View>

              <View style={styles.activityBadge}>
                <Text style={styles.activityBadgeText}>
                  {routineActivities.length} ACTIVITIES
                </Text>
              </View>
            </View>

            <Text style={styles.heroDescription}>
              Follow one activity at a time. Slickk
              will adapt the lesson if you are tired,
              confused or ahead of schedule.
            </Text>

            <View style={styles.progressTop}>
              <Text style={styles.progressLabel}>
                {completedCount} of{' '}
                {ROUTINE_ACTIVITIES.length} completed
              </Text>

              <Text style={styles.progressValue}>
                {Math.round(progress * 100)}%
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress * 100}%`,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.reminderCard}>
            <View style={styles.reminderIcon}>
              <Ionicons
                name="notifications-outline"
                size={23}
                color="#70F7D4"
              />
            </View>

            <View style={styles.reminderCopy}>
              <Text style={styles.reminderTitle}>
                Five-minute alerts
              </Text>

              <Text style={styles.reminderDescription}>
                Receive an alert shortly before each
                scheduled learning activity.
              </Text>
            </View>

            <Switch
              value={remindersEnabled}
              onValueChange={setRemindersEnabled}
              trackColor={{
                false: '#26384D',
                true: '#356D65',
              }}
              thumbColor={
                remindersEnabled
                  ? '#70F7D4'
                  : '#8998AA'
              }
            />
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                SCHEDULE
              </Text>

              <Text style={styles.sectionTitle}>
                Today’s activities
              </Text>
            </View>

            <Text style={styles.totalTime}>
              35 MIN
            </Text>
          </View>

          <View style={styles.timeline}>
            {routineActivities.map(
              (activity, index) => {
                const isCompleted =
                  Boolean(completed[activity.id]);

                return (
                  <View
                    key={activity.id}
                    style={styles.timelineRow}
                  >
                    <View style={styles.timeColumn}>
                      <Text style={styles.timeText}>
                        {activity.time}
                      </Text>

                      {index <
                      ROUTINE_ACTIVITIES.length -
                        1 ? (
                        <View
                          style={styles.timelineLine}
                        />
                      ) : null}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${activity.title} ${
                        isCompleted
                          ? 'incomplete'
                          : 'complete'
                      }`}
                      onPress={() =>
                        toggleActivity(activity.id)
                      }
                      style={({ pressed }) => [
                        styles.activityCard,
                        isCompleted &&
                          styles.activityCardCompleted,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.activityIcon,
                          isCompleted &&
                            styles.activityIconCompleted,
                        ]}
                      >
                        <Ionicons
                          name={
                            isCompleted
                              ? 'checkmark'
                              : activity.icon
                          }
                          size={21}
                          color={
                            isCompleted
                              ? '#081426'
                              : '#70F7D4'
                          }
                        />
                      </View>

                      <View
                        style={styles.activityCopy}
                      >
                        <Text
                          style={[
                            styles.activityTitle,
                            isCompleted &&
                              styles.activityTitleCompleted,
                          ]}
                        >
                          {activity.title}
                        </Text>

                        <Text
                          style={
                            styles.activitySubtitle
                          }
                        >
                          {activity.subtitle}
                        </Text>

                        <View
                          style={
                            styles.durationRow
                          }
                        >
                          <Ionicons
                            name="time-outline"
                            size={14}
                            color="#71849B"
                          />

                          <Text
                            style={
                              styles.durationText
                            }
                          >
                            {activity.duration}
                          </Text>
                        </View>
                      </View>

                      <Ionicons
                        name={
                          isCompleted
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={22}
                        color={
                          isCompleted
                            ? '#70F7D4'
                            : '#42556D'
                        }
                      />
                    </Pressable>
                  </View>
                );
              }
            )}
          </View>

          <View style={styles.infoCard}>
            <Ionicons
              name="sparkles-outline"
              size={21}
              color="#70F7D4"
            />

            <Text style={styles.infoText}>
              Slickk will eventually adjust this
              routine automatically using school
              schedules, test dates, mastery progress
              and parent preferences.
            </Text>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(
                insets.bottom,
                11
              ),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save daily routine"
            onPress={saveRoutine}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={21}
              color="#081426"
            />

            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving…' : 'Save routine'}
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

  header: {
    minHeight:
      Platform.OS === 'android'
        ? 100
        : 76,
    paddingHorizontal: 17,
    paddingTop:
      Platform.OS === 'android'
        ? 32
        : 9,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#081322',
    borderBottomWidth: 1,
    borderBottomColor: '#16273D',
  },

  headerButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#203047',
  },

  headerCopy: {
    flex: 1,
    paddingHorizontal: 12,
  },

  headerEyebrow: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  headerTitle: {
    marginTop: 3,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
  },

  addButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  container: {
    paddingHorizontal: 17,
    paddingTop: 17,
    paddingBottom: 28,
  },

  heroCard: {
    padding: 19,
    borderRadius: 25,
    backgroundColor: '#0D2730',
    borderWidth: 1,
    borderColor: '#1F5A57',
  },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  eyebrow: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  heroTitle: {
    marginTop: 5,
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '800',
  },

  activityBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },

  activityBadgeText: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  heroDescription: {
    marginTop: 12,
    color: '#9CB0B3',
    fontSize: 13,
    lineHeight: 20,
  },

  progressTop: {
    marginTop: 17,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  progressLabel: {
    color: '#AAB7C7',
    fontSize: 11,
    fontWeight: '600',
  },

  progressValue: {
    color: '#70F7D4',
    fontSize: 11,
    fontWeight: '800',
  },

  progressTrack: {
    marginTop: 9,
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#17333B',
  },

  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#70F7D4',
  },

  reminderCard: {
    marginTop: 14,
    padding: 15,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  reminderIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  reminderCopy: {
    flex: 1,
    marginHorizontal: 11,
  },

  reminderTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  reminderDescription: {
    marginTop: 4,
    color: '#71849B',
    fontSize: 11,
    lineHeight: 16,
  },

  sectionHeader: {
    marginTop: 25,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  totalTime: {
    color: '#71849B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  timeline: {
    gap: 0,
  },

  timelineRow: {
    flexDirection: 'row',
  },

  timeColumn: {
    width: 64,
    alignItems: 'center',
  },

  timeText: {
    paddingTop: 17,
    color: '#71849B',
    fontSize: 10,
    fontWeight: '700',
  },

  timelineLine: {
    flex: 1,
    width: 1,
    marginTop: 8,
    backgroundColor: '#21364E',
  },

  activityCard: {
    flex: 1,
    minHeight: 114,
    marginBottom: 12,
    padding: 14,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  activityCardCompleted: {
    backgroundColor: '#0B2029',
    borderColor: '#27534F',
  },

  activityIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  activityIconCompleted: {
    backgroundColor: '#70F7D4',
  },

  activityCopy: {
    flex: 1,
    marginHorizontal: 11,
  },

  activityTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },

  activityTitleCompleted: {
    color: '#7F91A7',
    textDecorationLine: 'line-through',
  },

  activitySubtitle: {
    marginTop: 4,
    color: '#71849B',
    fontSize: 11,
    lineHeight: 16,
  },

  durationRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  durationText: {
    color: '#71849B',
    fontSize: 10,
    fontWeight: '600',
  },

  infoCard: {
    marginTop: 8,
    padding: 15,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#0A1727',
    borderWidth: 1,
    borderColor: '#192B41',
  },

  infoText: {
    flex: 1,
    color: '#71849B',
    fontSize: 11,
    lineHeight: 17,
  },

  footer: {
    paddingHorizontal: 17,
    paddingTop: 10,
    paddingBottom:
      Platform.OS === 'android'
        ? 15
        : 11,
    backgroundColor: '#081322',
    borderTopWidth: 1,
    borderTopColor: '#16273D',
  },

  saveButton: {
    minHeight: 52,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#70F7D4',
  },

  saveButtonText: {
    color: '#081426',
    fontSize: 15,
    fontWeight: '800',
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
});
