import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
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
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  loadStudentProfile,
  type StudentEducationProfile,
} from '@/services/student-profile';
import { loadParentSummary, type ParentSummary } from '@/services/parent-summary';
import { loadRoutineState, type RoutineState } from '@/services/routine';
import { loadParentPreferences, saveParentPreferences } from '@/services/parent-preferences';


type IoniconName =
  ComponentProps<typeof Ionicons>['name'];

type ParentAlert = {
  id: string;
  icon: IoniconName;
  title: string;
  description: string;
  time: string;
  level: 'info' | 'attention';
};

export default function ParentPortalScreen() {
  const insets = useSafeAreaInsets();

  const [studentProfile, setStudentProfile] =
    useState<StudentEducationProfile | null>(null);
  const [summary, setSummary] = useState<ParentSummary | null>(null);
  const [routine, setRoutine] = useState<RoutineState | null>(null);

  const [classAlerts, setClassAlerts] =
    useState(true);

  const [testResults, setTestResults] =
    useState(true);

  const [weeklyReports, setWeeklyReports] =
    useState(true);

  useEffect(() => {
    let isMounted = true;

    Promise.all([loadStudentProfile(), loadParentSummary(), loadRoutineState(), loadParentPreferences()])
      .then(([profile, report, savedRoutine, preferences]) => {
        if (isMounted) {
          setStudentProfile(profile);
          setSummary(report);
          setRoutine(savedRoutine);
          setClassAlerts(preferences.classAlerts);
          setTestResults(preferences.testResults);
          setWeeklyReports(preferences.weeklyReports);
        }
      })
      .catch((error) => {
        console.error(
          'Unable to load Parent Portal profile:',
          error
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const studentName =
    studentProfile?.studentName?.trim() ||
    'Student';

  const studentGrade =
    studentProfile?.grade?.trim() ||
    'Class 7';

  const profileSubjects = (
    studentProfile?.subjects ?? []
  )
    .map((subject) => subject.trim())
    .filter(Boolean)
    .slice(0, 2);

  const primarySubject =
    profileSubjects[0] || 'General Studies';

  const routineCompleted = Object.values(routine?.completed ?? {}).filter(Boolean).length;
  const routineTotal = 3;
  const routineProgress = Math.round((routineCompleted / routineTotal) * 100);
  const parentAlerts: ParentAlert[] = [];
  if (summary?.priorities[0]) parentAlerts.push({
    id: 'priority', icon: 'book-outline', title: `${summary.priorities[0].subject} needs review`,
    description: summary.priorities[0].nextAction, time: 'Next', level: 'attention',
  });
  if (summary && summary.verifiedAnswers === 0) parentAlerts.push({
    id: 'evidence', icon: 'document-text-outline', title: 'Verified assessment needed',
    description: 'Complete and submit a weekly test so progress claims use checked evidence.', time: 'This week', level: 'info',
  });
  if (summary?.wellbeingSupport?.needsTrustedAdult) {
    parentAlerts.unshift({
      id: 'trusted-adult', icon: 'heart-outline',
      title: 'Student requested trusted-adult support',
      description: 'Please check in with the student in person now. Slickk does not diagnose or replace human care.',
      time: 'Now', level: 'attention',
    });
  }


  const showReportPreview = () => {
    Alert.alert(
      summary ? `${summary.studentName}'s progress` : 'Weekly report',
      summary
        ? `${summary.lessonsCompleted} learning turns • ${summary.verifiedAnswers} verified answers${summary.accuracyPercentage === null ? '' : ` • ${summary.accuracyPercentage}% accuracy`}\n\nHome support: ${summary.homeSupport}\n\n${summary.evidenceNotice}`
        : 'Complete a tutor lesson and a verified weekly check to generate an evidence-based family report.'
    );
  };

  const updatePreferences = (next: Partial<{ classAlerts: boolean; testResults: boolean; weeklyReports: boolean }>) => {
    const value = { classAlerts, testResults, weeklyReports, ...next };
    setClassAlerts(value.classAlerts);
    setTestResults(value.testResults);
    setWeeklyReports(value.weeklyReports);
    void saveParentPreferences(value);
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
              FAMILY VIEW
            </Text>

            <Text style={styles.headerTitle}>
              Parent Portal
            </Text>
          </View>

          <View style={styles.messageButton}>
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color="#081426"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.studentCard}>
            <View style={styles.studentAvatar}>
              <Ionicons
                name="person"
                size={27}
                color="#081426"
              />
            </View>

            <View style={styles.studentCopy}>
              <Text style={styles.eyebrow}>
                STUDENT OVERVIEW
              </Text>

              <Text style={styles.studentName}>
                {studentName}
              </Text>

              <Text style={styles.studentContext}>
                {studentGrade} | Active learning profile
              </Text>
            </View>

            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />

              <Text style={styles.activeText}>
                ACTIVE
              </Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons
                  name="school-outline"
                  size={22}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.summaryValue}>
                {summary?.lessonsCompleted ?? 0}
              </Text>

              <Text style={styles.summaryLabel}>
                Lessons completed
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons
                  name="flame-outline"
                  size={22}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.summaryValue}>
                {summary?.subjectsStudied ?? 0}
              </Text>

              <Text style={styles.summaryLabel}>
                Subjects studied
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons
                  name="time-outline"
                  size={22}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.summaryValue}>
                {summary?.verifiedAnswers ?? 0}
              </Text>

              <Text style={styles.summaryLabel}>
                Verified answers
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.summaryValue}>
                {summary?.accuracyPercentage === null || summary?.accuracyPercentage === undefined ? '—' : `${summary.accuracyPercentage}%`}
              </Text>

              <Text style={styles.summaryLabel}>
                Verified accuracy
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                TODAY
              </Text>

              <Text style={styles.sectionTitle}>
                Learning status
              </Text>
            </View>

            <Text style={styles.statusLabel}>
              {routineCompleted === 0 ? 'NOT STARTED' : routineCompleted === routineTotal ? 'COMPLETE' : 'IN PROGRESS'}
            </Text>
          </View>

          <View style={styles.todayCard}>
            <View style={styles.todayTop}>
              <View style={styles.todayIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={23}
                  color="#081426"
                />
              </View>

              <View style={styles.todayCopy}>
                <Text style={styles.todayTitle}>
                  Daily routine
                </Text>

                <Text style={styles.todayDescription}>
                  {primarySubject} lesson, textbook
                  review and quick revision are scheduled.
                </Text>
              </View>
            </View>

            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>
                {routineCompleted} of {routineTotal} activities completed
              </Text>

              <Text style={styles.progressValue}>
                {routineProgress}%
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${routineProgress}%` }]} />
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                ALERTS
              </Text>

              <Text style={styles.sectionTitle}>
                What needs attention
              </Text>
            </View>

            <View style={styles.alertCount}>
              <Text style={styles.alertCountText}>
                {parentAlerts.length}
              </Text>
            </View>
          </View>

          <View style={styles.alertList}>
            {parentAlerts.map((alert) => (
              <View
                key={alert.id}
                style={[
                  styles.alertCard,
                  alert.level === 'attention' &&
                    styles.alertCardAttention,
                ]}
              >
                <View
                  style={[
                    styles.alertIcon,
                    alert.level === 'attention' &&
                      styles.alertIconAttention,
                  ]}
                >
                  <Ionicons
                    name={alert.icon}
                    size={21}
                    color={
                      alert.level === 'attention'
                        ? '#FFD36E'
                        : '#70F7D4'
                    }
                  />
                </View>

                <View style={styles.alertCopy}>
                  <Text style={styles.alertTitle}>
                    {alert.title}
                  </Text>

                  <Text
                    style={styles.alertDescription}
                  >
                    {alert.description}
                  </Text>
                </View>

                <Text style={styles.alertTime}>
                  {alert.time}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                WEEKLY REPORT
              </Text>

              <Text style={styles.sectionTitle}>
                Progress summary
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open weekly report preview"
            onPress={showReportPreview}
            style={({ pressed }) => [
              styles.reportCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.reportIcon}>
              <Ionicons
                name="analytics-outline"
                size={25}
                color="#081426"
              />
            </View>

            <View style={styles.reportCopy}>
              <Text style={styles.reportTitle}>
                {summary?.priorities[0]
                  ? `${summary.priorities[0].subject} needs focused support`
                  : summary?.strengths[0]
                    ? `${summary.strengths[0].subject} is a growing strength`
                    : 'Build the first evidence-based report'}
              </Text>

              <Text style={styles.reportDescription}>
                {summary?.priorities[0]?.nextAction || summary?.homeSupport ||
                  'Complete lessons and a verified weekly test to generate meaningful progress evidence.'}
              </Text>

              <View style={styles.reportTags}>
                <View style={styles.reportTag}>
                  <Text style={styles.reportTagText}>
                    STRENGTHS
                  </Text>
                </View>

                <View style={styles.reportTag}>
                  <Text style={styles.reportTagText}>
                    REVISION
                  </Text>
                </View>

                <View style={styles.reportTag}>
                  <Text style={styles.reportTagText}>
                    TESTS
                  </Text>
                </View>
              </View>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color="#70F7D4"
            />
          </Pressable>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                NOTIFICATIONS
              </Text>

              <Text style={styles.sectionTitle}>
                Parent preferences
              </Text>
            </View>
          </View>

          <View style={styles.preferenceCard}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceIcon}>
                <Ionicons
                  name="notifications-outline"
                  size={21}
                  color="#70F7D4"
                />
              </View>

              <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceTitle}>
                  Class alerts
                </Text>

                <Text
                  style={styles.preferenceDescription}
                >
                  Receive upcoming and missed-class
                  notifications.
                </Text>
              </View>

              <Switch
                value={classAlerts}
                onValueChange={(value) => updatePreferences({ classAlerts: value })}
                trackColor={{
                  false: '#26384D',
                  true: '#356D65',
                }}
                thumbColor={
                  classAlerts
                    ? '#70F7D4'
                    : '#8998AA'
                }
              />
            </View>

            <View style={styles.preferenceDivider} />

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={21}
                  color="#70F7D4"
                />
              </View>

              <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceTitle}>
                  Test results
                </Text>

                <Text
                  style={styles.preferenceDescription}
                >
                  Receive scores and grading feedback.
                </Text>
              </View>

              <Switch
                value={testResults}
                onValueChange={(value) => updatePreferences({ testResults: value })}
                trackColor={{
                  false: '#26384D',
                  true: '#356D65',
                }}
                thumbColor={
                  testResults
                    ? '#70F7D4'
                    : '#8998AA'
                }
              />
            </View>

            <View style={styles.preferenceDivider} />

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceIcon}>
                <Ionicons
                  name="mail-outline"
                  size={21}
                  color="#70F7D4"
                />
              </View>

              <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceTitle}>
                  Weekly reports
                </Text>

                <Text
                  style={styles.preferenceDescription}
                >
                  Receive the weekly parent summary.
                </Text>
              </View>

              <Switch
                value={weeklyReports}
                onValueChange={(value) => updatePreferences({ weeklyReports: value })}
                trackColor={{
                  false: '#26384D',
                  true: '#356D65',
                }}
                thumbColor={
                  weeklyReports
                    ? '#70F7D4'
                    : '#8998AA'
                }
              />
            </View>
          </View>

          <View style={styles.securityCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color="#70F7D4"
            />

            <Text style={styles.securityText}>
              Reports are available only to the linked
              student or guardian account. Academic
              claims use educator-verified evidence.
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
            accessibilityLabel="View weekly report"
            onPress={showReportPreview}
            style={({ pressed }) => [
              styles.reportButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="document-text-outline"
              size={21}
              color="#081426"
            />

            <Text style={styles.reportButtonText}>
              View weekly report
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
    fontWeight: '800',
  },

  messageButton: {
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

  studentCard: {
    padding: 17,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D2730',
    borderWidth: 1,
    borderColor: '#1F5A57',
  },

  studentAvatar: {
    width: 51,
    height: 51,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  studentCopy: {
    flex: 1,
    marginHorizontal: 12,
  },

  eyebrow: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  studentName: {
    marginTop: 3,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  studentContext: {
    marginTop: 3,
    color: '#8EA4A8',
    fontSize: 11,
  },

  activeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },

  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#70F7D4',
  },

  activeText: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  summaryGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 11,
  },

  summaryCard: {
    width: '48.4%',
    minHeight: 129,
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  summaryValue: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  summaryLabel: {
    marginTop: 3,
    color: '#71849B',
    fontSize: 10,
    lineHeight: 15,
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

  statusLabel: {
    color: '#FFD36E',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  todayCard: {
    padding: 16,
    borderRadius: 21,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  todayTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  todayIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  todayCopy: {
    flex: 1,
    marginLeft: 11,
  },

  todayTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  todayDescription: {
    marginTop: 4,
    color: '#71849B',
    fontSize: 11,
    lineHeight: 17,
  },

  progressHeader: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  progressText: {
    color: '#AAB7C7',
    fontSize: 10,
    fontWeight: '600',
  },

  progressValue: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '800',
  },

  progressTrack: {
    marginTop: 8,
    height: 5,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#1B2C40',
  },

  progressFill: {
    width: '0%',
    height: '100%',
    backgroundColor: '#70F7D4',
  },

  alertCount: {
    minWidth: 29,
    height: 29,
    paddingHorizontal: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },

  alertCountText: {
    color: '#70F7D4',
    fontSize: 11,
    fontWeight: '900',
  },

  alertList: {
    gap: 10,
  },

  alertCard: {
    padding: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  alertCardAttention: {
    backgroundColor: '#211E1A',
    borderColor: '#4A4027',
  },

  alertIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  alertIconAttention: {
    backgroundColor:
      'rgba(255, 211, 110, 0.09)',
  },

  alertCopy: {
    flex: 1,
    marginHorizontal: 11,
  },

  alertTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  alertDescription: {
    marginTop: 4,
    color: '#71849B',
    fontSize: 10,
    lineHeight: 15,
  },

  alertTime: {
    color: '#71849B',
    fontSize: 9,
    fontWeight: '700',
  },

  reportCard: {
    padding: 16,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1C2D',
    borderWidth: 1,
    borderColor: '#24415A',
  },

  reportIcon: {
    width: 47,
    height: 47,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  reportCopy: {
    flex: 1,
    marginHorizontal: 11,
  },

  reportTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  reportDescription: {
    marginTop: 4,
    color: '#7F91A7',
    fontSize: 10,
    lineHeight: 15,
  },

  reportTags: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },

  reportTag: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor:
      'rgba(112, 247, 212, 0.08)',
  },

  reportTagText: {
    color: '#70F7D4',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  preferenceCard: {
    paddingHorizontal: 15,
    borderRadius: 21,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  preferenceRow: {
    minHeight: 79,
    flexDirection: 'row',
    alignItems: 'center',
  },

  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  preferenceCopy: {
    flex: 1,
    marginHorizontal: 11,
  },

  preferenceTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  preferenceDescription: {
    marginTop: 3,
    color: '#71849B',
    fontSize: 10,
    lineHeight: 15,
  },

  preferenceDivider: {
    height: 1,
    backgroundColor: '#1A2C42',
  },

  securityCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#0A1727',
    borderWidth: 1,
    borderColor: '#192B41',
  },

  securityText: {
    flex: 1,
    color: '#71849B',
    fontSize: 10,
    lineHeight: 16,
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

  reportButton: {
    minHeight: 52,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#70F7D4',
  },

  reportButtonText: {
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
