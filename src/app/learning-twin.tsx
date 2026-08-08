import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    getTopicsDueForReview,
    LearningTwin,
    loadLearningTwin,
} from "../ai/learningTwin";

const STUDENT_ID = "student-001";
const STUDENT_NAME = "Mahir";

export default function LearningTwinScreen() {
  const [twin, setTwin] = useState<LearningTwin | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    async function loadProfile() {
      try {
        const profile = await loadLearningTwin(
          STUDENT_ID,
          STUDENT_NAME,
        );

        setTwin(profile);
      } catch (error) {
        console.error("Unable to load Learning Twin:", error);

        setErrorMessage(
          "The learning profile could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>
          Loading Learning Twin...
        </Text>
      </View>
    );
  }

  if (errorMessage || !twin) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {errorMessage ?? "Learning profile unavailable."}
        </Text>
      </View>
    );
  }

  const topics = Object.values(twin.topics);
  const reviewsDue = getTopicsDueForReview(twin);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Learning Twin</Text>

      <Text style={styles.subtitle}>
        Personalized learning intelligence for{" "}
        {twin.studentName}
      </Text>

      <View style={styles.summaryGrid}>
        <SummaryCard
          label="Average Mastery"
          value={`${twin.averageMastery}%`}
        />

        <SummaryCard
          label="Confidence"
          value={`${twin.averageConfidence}%`}
        />

        <SummaryCard
          label="Motivation"
          value={`${twin.motivationScore}%`}
        />

        <SummaryCard
          label="Reviews Due"
          value={String(reviewsDue.length)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Learning Preferences
        </Text>

        <Text style={styles.informationText}>
          Language: {twin.preferredLanguage}
        </Text>

        <Text style={styles.informationText}>
          Learning style: {formatLabel(
            twin.preferredLearningStyle,
          )}
        </Text>

        <Text style={styles.informationText}>
          Current mood: {formatLabel(twin.mood)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Strong Topics
        </Text>

        {twin.strongTopics.length === 0 ? (
          <Text style={styles.emptyText}>
            Complete lessons and quizzes to identify strong
            topics.
          </Text>
        ) : (
          twin.strongTopics.map((topic) => (
            <Text key={topic} style={styles.strongTopic}>
              ✓ {topic}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Topics Needing Improvement
        </Text>

        {twin.weakTopics.length === 0 ? (
          <Text style={styles.emptyText}>
            No weak topics have been identified yet.
          </Text>
        ) : (
          twin.weakTopics.map((topic) => (
            <Text key={topic} style={styles.weakTopic}>
              • {topic}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Topic Progress
        </Text>

        {topics.length === 0 ? (
          <Text style={styles.emptyText}>
            Topic progress will appear after the student
            completes a lesson or quiz.
          </Text>
        ) : (
          topics.map((topic) => (
            <View
              key={topic.topicId}
              style={styles.topicCard}
            >
              <Text style={styles.topicName}>
                {topic.topic}
              </Text>

              <Text style={styles.topicSubject}>
                {topic.subject}
              </Text>

              <ProgressRow
                label="Mastery"
                value={`${topic.mastery}%`}
              />

              <ProgressRow
                label="Confidence"
                value={`${topic.confidence}%`}
              />

              <ProgressRow
                label="Retention"
                value={`${topic.retention}%`}
              />

              <ProgressRow
                label="Difficulty"
                value={`${topic.currentDifficulty}/10`}
              />

              <ProgressRow
                label="Correct answers"
                value={`${topic.correctAnswers}/${topic.totalAttempts}`}
              />

              <ProgressRow
                label="Next review"
                value={formatReviewDate(
                  topic.nextReviewAt,
                )}
              />
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>

      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ProgressRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.progressRow}>
      <Text style={styles.progressLabel}>{label}</Text>

      <Text style={styles.progressValue}>{value}</Text>
    </View>
  );
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatReviewDate(
  dateValue: string | null,
): string {
  if (!dateValue) {
    return "Not scheduled";
  }

  return new Date(dateValue).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: "#f5f7fb",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f5f7fb",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 15,
  },

  errorText: {
    textAlign: "center",
    fontSize: 16,
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
  },

  subtitle: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 15,
    opacity: 0.7,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  summaryCard: {
    width: "48%",
    padding: 18,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },

  summaryValue: {
    fontSize: 26,
    fontWeight: "700",
  },

  summaryLabel: {
    marginTop: 5,
    fontSize: 13,
    opacity: 0.65,
  },

  section: {
    marginTop: 18,
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },

  sectionTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: "700",
  },

  informationText: {
    marginBottom: 8,
    fontSize: 15,
  },

  emptyText: {
    lineHeight: 21,
    opacity: 0.6,
  },

  strongTopic: {
    marginBottom: 8,
    fontSize: 15,
  },

  weakTopic: {
    marginBottom: 8,
    fontSize: 15,
  },

  topicCard: {
    marginBottom: 14,
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#f0f3f8",
  },

  topicName: {
    fontSize: 18,
    fontWeight: "700",
  },

  topicSubject: {
    marginTop: 2,
    marginBottom: 12,
    fontSize: 14,
    opacity: 0.6,
  },

  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },

  progressLabel: {
    fontSize: 14,
    opacity: 0.75,
  },

  progressValue: {
    fontSize: 14,
    fontWeight: "600",
  },
});