import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  loadStudentProfile,
  type StudentEducationProfile,
} from '@/services/student-profile';
import {
  generateWeeklyAssessment,
  loadAssessmentHistory,
  type AssessmentHistoryItem,
  type WeeklyAssessment,
} from '@/services/weekly-assessment';
import { shareWeeklyAssessmentPdf } from '@/services/assessment-pdf';

type IoniconName =
  ComponentProps<typeof Ionicons>['name'];

type TestTopic = {
  id: string;
  icon: IoniconName;
  subject: string;
  topic: string;
  readiness: number;
};

const TEST_TOPICS: TestTopic[] = [
  {
    id: 'biology',
    icon: 'leaf-outline',
    subject: 'Biology',
    topic: 'Characteristics of living organisms',
    readiness: 0,
  },
  {
    id: 'mathematics',
    icon: 'calculator-outline',
    subject: 'Mathematics',
    topic: 'Fractions and simple equations',
    readiness: 0,
  },
  {
    id: 'english',
    icon: 'language-outline',
    subject: 'English',
    topic: 'Reading comprehension and grammar',
    readiness: 0,
  },
];

export default function WeeklyTestScreen() {
  const insets = useSafeAreaInsets();

  const [studentProfile, setStudentProfile] =
    useState<StudentEducationProfile | null>(null);

  const [selectedTopics, setSelectedTopics] =
    useState<Record<string, boolean>>({});

  const [assessment, setAssessment] =
    useState<WeeklyAssessment | null>(null);
  const [isGenerating, setIsGenerating] =
    useState(false);
  const [isExporting, setIsExporting] =
    useState(false);
  const [history, setHistory] = useState<AssessmentHistoryItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([loadStudentProfile(), loadAssessmentHistory()])
      .then(([profile, savedHistory]) => {
        if (isMounted) {
          setStudentProfile(profile);
          setHistory(savedHistory);
        }
      })
      .catch((error) => {
        console.error(
          'Unable to load Weekly Test profile:',
          error
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const testTopics = useMemo<TestTopic[]>(() => {
    const subjects = (
      studentProfile?.subjects ?? []
    )
      .map((subject) => subject.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (subjects.length === 0) {
      return TEST_TOPICS;
    }

    return subjects.map((subject, index) => {
      const normalized = subject.toLowerCase();

      const icon: IoniconName =
        normalized.includes('math')
          ? 'calculator-outline'
          : normalized.includes('biology') ||
              normalized.includes('science')
            ? 'leaf-outline'
            : normalized.includes('english') ||
                normalized.includes('language')
              ? 'language-outline'
              : 'book-outline';

      const topic =
        normalized.includes('math')
          ? 'Recent Mathematics lessons'
          : normalized.includes('english')
            ? 'Reading, writing and grammar review'
            : normalized.includes('biology')
              ? 'Recent Biology lessons'
              : `Recent ${subject} lessons`;

      const slug =
        normalized
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') ||
        'subject';

      return {
        id: `${slug}-${index + 1}`,
        icon,
        subject,
        topic,
        readiness: 0,
      };
    });
  }, [studentProfile]);

  useEffect(() => {
    // Topic defaults must be reconciled after the saved student profile loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedTopics((current) => {
      const next: Record<string, boolean> = {};

      testTopics.forEach((topic, index) => {
        next[topic.id] =
          current[topic.id] ??
          index < Math.min(2, testTopics.length);
      });

      return next;
    });
  }, [testTopics]);

  const selectedCount = useMemo(
    () =>
      testTopics.filter(
        (topic) => selectedTopics[topic.id]
      ).length,
    [selectedTopics, testTopics]
  );

  const questionCount =
    selectedCount === 0
      ? 0
      : selectedCount * 5;

  const estimatedMinutes =
    selectedCount === 0
      ? 0
      : selectedCount * 10;

  const toggleTopic = (topicId: string) => {
    setSelectedTopics((current) => ({
      ...current,
      [topicId]: !current[topicId],
    }));
  };

  const createTest = async () => {
    if (selectedCount === 0) {
      Alert.alert(
        'Choose a topic',
        'Select at least one recent topic before creating the test.'
      );

      return;
    }

    setIsGenerating(true);
    try {
      setAssessment(
        await generateWeeklyAssessment(
          questionCount,
          testTopics
            .filter((topic) => selectedTopics[topic.id])
            .map((topic) => topic.subject)
        )
      );
    } catch (error) {
      Alert.alert(
        'Test generation failed',
        error instanceof Error
          ? error.message
          : 'Slickk could not generate this test.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const uploadAnswers = () => {
    router.push({
      pathname: '/camera-learn',
      params: {
        mode: 'camera',
        purpose: 'test-answers',
      },
    });
  };

  const exportPdf = async () => {
    if (!assessment) {
      Alert.alert('Create the test first', 'Generate an adaptive test before exporting its PDF.');
      return;
    }
    setIsExporting(true);
    try {
      await shareWeeklyAssessmentPdf(assessment);
    } catch (error) {
      Alert.alert('PDF export failed', error instanceof Error ? error.message : 'Slickk could not create this PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const showHistory = () => {
    Alert.alert(
      'Verified test history',
      history.length
        ? history.slice(0, 5).map((item) => `${new Date(item.verifiedAt).toLocaleDateString()}: ${item.correct}/${item.total} correct — ${item.title}`).join('\n\n')
        : 'No educator-verified tests have been completed yet.'
    );
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
              ASSESSMENT
            </Text>

            <Text style={styles.headerTitle}>
              Weekly Test
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload completed test answers"
            onPress={uploadAnswers}
            style={({ pressed }) => [
              styles.uploadHeaderButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="camera-outline"
              size={21}
              color="#081426"
            />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={25}
                  color="#081426"
                />
              </View>

              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>
                  NEXT ASSESSMENT
                </Text>

                <Text style={styles.heroTitle}>
                  Build this week’s test
                </Text>
              </View>

              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>
                  DAY 5
                </Text>
              </View>
            </View>

            <Text style={styles.heroDescription}>
              Slickk will test recent lessons, identify
              mistakes and adapt the next study plan.
            </Text>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {selectedCount}
                </Text>

                <Text style={styles.summaryLabel}>
                  Topics
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {questionCount}
                </Text>

                <Text style={styles.summaryLabel}>
                  Questions
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {estimatedMinutes}
                </Text>

                <Text style={styles.summaryLabel}>
                  Minutes
                </Text>
              </View>
            </View>
          </View>

          {assessment ? (
            <>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.eyebrow}>GENERATED TEST</Text>
                  <Text style={styles.sectionTitle}>{assessment.totalPoints} marks • {assessment.durationMinutes} minutes</Text>
                </View>
                <Text style={styles.selectedLabel}>READY</Text>
              </View>

              <View style={styles.questionPaper}>
                {assessment.questions.map((question) => (
                  <View key={question.id} style={styles.questionRow}>
                    <View style={styles.questionNumber}><Text style={styles.questionNumberText}>{question.number}</Text></View>
                    <View style={styles.questionCopy}>
                      <Text style={styles.questionMeta}>{question.subject.toUpperCase()} • {question.kind.replaceAll('-', ' ')}</Text>
                      <Text style={styles.questionPrompt}>{question.prompt}</Text>
                      <Text style={styles.questionMarks}>{question.points} marks</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                TEST COVERAGE
              </Text>

              <Text style={styles.sectionTitle}>
                Choose recent topics
              </Text>
            </View>

            <Text style={styles.selectedLabel}>
              {selectedCount} SELECTED
            </Text>
          </View>

          <View style={styles.topicList}>
            {testTopics.map((topic) => {
              const isSelected =
                Boolean(selectedTopics[topic.id]);

              return (
                <Pressable
                  key={topic.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${
                    isSelected ? 'Remove' : 'Add'
                  } ${topic.subject} from the weekly test`}
                  onPress={() =>
                    toggleTopic(topic.id)
                  }
                  style={({ pressed }) => [
                    styles.topicCard,
                    isSelected &&
                      styles.topicCardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.topicIcon,
                      isSelected &&
                        styles.topicIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={topic.icon}
                      size={22}
                      color={
                        isSelected
                          ? '#081426'
                          : '#70F7D4'
                      }
                    />
                  </View>

                  <View style={styles.topicCopy}>
                    <Text style={styles.topicSubject}>
                      {topic.subject}
                    </Text>

                    <Text style={styles.topicTitle}>
                      {topic.topic}
                    </Text>

                    <View style={styles.readinessRow}>
                      <Text style={styles.readinessText}>
                        Readiness {topic.readiness}%
                      </Text>

                      <View
                        style={styles.readinessTrack}
                      >
                        <View
                          style={[
                            styles.readinessFill,
                            {
                              width: `${topic.readiness}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  <Ionicons
                    name={
                      isSelected
                        ? 'checkmark-circle'
                        : 'ellipse-outline'
                    }
                    size={23}
                    color={
                      isSelected
                        ? '#70F7D4'
                        : '#42556D'
                    }
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>
                TEST OUTPUT
              </Text>

              <Text style={styles.sectionTitle}>
                Create and submit
              </Text>
            </View>
          </View>

          <View style={styles.outputGrid}>
            <Pressable
              disabled={isExporting}
              onPress={() => void exportPdf()}
              style={({ pressed }) => [
                styles.outputCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.outputIcon}>
                <Ionicons
                  name="document-outline"
                  size={23}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.outputTitle}>{isExporting ? 'Creating PDF…' : 'Export PDF'}</Text>

              <Text style={styles.outputDescription}>
                Test paper and educator rubric
              </Text>
            </Pressable>

            <Pressable
              onPress={uploadAnswers}
              style={({ pressed }) => [
                styles.outputCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.outputIcon}>
                <Ionicons
                  name="camera-outline"
                  size={23}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.outputTitle}>
                Upload answers
              </Text>

              <Text style={styles.outputDescription}>
                Photograph written answers
              </Text>
            </Pressable>

            <Pressable
              onPress={showHistory}
              style={({ pressed }) => [
                styles.outputCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.outputIcon}>
                <Ionicons
                  name="time-outline"
                  size={23}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.outputTitle}>
                Test history
              </Text>

              <Text style={styles.outputDescription}>
                Scores and feedback
              </Text>
            </Pressable>
          </View>

          <View style={styles.gradingCard}>
            <View style={styles.gradingIcon}>
              <Ionicons
                name="analytics-outline"
                size={23}
                color="#70F7D4"
              />
            </View>

            <View style={styles.gradingCopy}>
              <Text style={styles.gradingTitle}>
                Adaptive grading
              </Text>

              <Text style={styles.gradingDescription}>
                Results will update the Learning Twin,
                revision topics and next week’s routine.
              </Text>
            </View>
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
            accessibilityLabel="Create weekly test"
            disabled={questionCount === 0 || isGenerating}
            onPress={() => void createTest()}
            style={({ pressed }) => [
              styles.createButton,
              (questionCount === 0 || isGenerating) &&
                styles.createButtonDisabled,
              pressed &&
                questionCount > 0 &&
                styles.buttonPressed,
            ]}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#081426" />
            ) : (
              <Ionicons name="sparkles" size={21} color="#081426" />
            )}

            <Text style={styles.createButtonText}>
              {isGenerating ? 'Building adaptive test…' : `Create ${questionCount || ''} question test`}
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

  uploadHeaderButton: {
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
    padding: 18,
    borderRadius: 25,
    backgroundColor: '#0D2730',
    borderWidth: 1,
    borderColor: '#1F5A57',
  },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  heroCopy: {
    flex: 1,
    marginHorizontal: 12,
  },

  eyebrow: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  heroTitle: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
  },

  dayBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor:
      'rgba(112, 247, 212, 0.10)',
  },

  dayBadgeText: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  heroDescription: {
    marginTop: 14,
    color: '#9CB0B3',
    fontSize: 13,
    lineHeight: 20,
  },

  summaryRow: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(5, 18, 25, 0.35)',
  },

  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },

  summaryValue: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
  },

  summaryLabel: {
    marginTop: 3,
    color: '#82999E',
    fontSize: 9,
    fontWeight: '700',
  },

  summaryDivider: {
    width: 1,
    height: 31,
    backgroundColor: '#28504F',
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

  selectedLabel: {
    color: '#71849B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  topicList: {
    gap: 11,
  },

  topicCard: {
    minHeight: 115,
    padding: 14,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  topicCardSelected: {
    backgroundColor: '#0B2029',
    borderColor: '#27534F',
  },

  topicIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  topicIconSelected: {
    backgroundColor: '#70F7D4',
  },

  topicCopy: {
    flex: 1,
    marginHorizontal: 11,
  },

  topicSubject: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  topicTitle: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },

  readinessRow: {
    marginTop: 9,
  },

  readinessText: {
    color: '#71849B',
    fontSize: 9,
    fontWeight: '600',
  },

  readinessTrack: {
    marginTop: 5,
    height: 4,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: '#1B2C40',
  },

  readinessFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#70F7D4',
  },

  questionPaper: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  questionRow: {
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#29405A',
  },

  questionNumber: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#173C3A',
  },

  questionNumberText: {
    color: '#70F7D4',
    fontSize: 12,
    fontWeight: '900',
  },

  questionCopy: {
    flex: 1,
  },

  questionMeta: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  questionPrompt: {
    marginTop: 5,
    color: '#E8EEF7',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },

  questionMarks: {
    marginTop: 5,
    color: '#71849B',
    fontSize: 9,
  },

  outputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 11,
  },

  outputCard: {
    width: '48.4%',
    minHeight: 137,
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  outputIcon: {
    width: 41,
    height: 41,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  outputTitle: {
    marginTop: 13,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  outputDescription: {
    marginTop: 5,
    color: '#71849B',
    fontSize: 11,
    lineHeight: 16,
  },

  gradingCard: {
    marginTop: 17,
    padding: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1728',
    borderWidth: 1,
    borderColor: '#1D3048',
  },

  gradingIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  gradingCopy: {
    flex: 1,
    marginLeft: 11,
  },

  gradingTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  gradingDescription: {
    marginTop: 4,
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

  createButton: {
    minHeight: 52,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#70F7D4',
  },

  createButtonDisabled: {
    opacity: 0.45,
  },

  createButtonText: {
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
