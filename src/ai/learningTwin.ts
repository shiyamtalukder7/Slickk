import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "slickk_learning_twin_v1";

export type LearningLanguage = "English" | "Bangla" | "Banglish";

export type LearningStyle =
  | "reading"
  | "listening"
  | "visual"
  | "practice"
  | "step_by_step"
  | "analogy"
  | "unknown";

export type Mood =
  | "happy"
  | "normal"
  | "tired"
  | "frustrated"
  | "sad"
  | "unknown";

export interface TopicMastery {
  topicId: string;
  subject: string;
  topic: string;

  mastery: number;
  confidence: number;
  retention: number;

  correctAnswers: number;
  incorrectAnswers: number;
  totalAttempts: number;

  currentDifficulty: number;

  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  reviewIntervalDays: number;
}

export interface LearningTwin {
  studentId: string;
  studentName: string;

  preferredLanguage: LearningLanguage;
  preferredLearningStyle: LearningStyle;

  mood: Mood;
  motivationScore: number;

  averageConfidence: number;
  averageMastery: number;

  strongTopics: string[];
  weakTopics: string[];

  topics: Record<string, TopicMastery>;

  createdAt: string;
  updatedAt: string;
}

export interface LearningAttempt {
  studentId: string;
  topicId: string;
  subject: string;
  topic: string;

  isCorrect: boolean;
  confidence: number;
  responseTimeSeconds?: number;
  hintsUsed?: number;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createTopic(
  topicId: string,
  subject: string,
  topic: string,
): TopicMastery {
  return {
    topicId,
    subject,
    topic,

    mastery: 0,
    confidence: 50,
    retention: 50,

    correctAnswers: 0,
    incorrectAnswers: 0,
    totalAttempts: 0,

    currentDifficulty: 1,

    lastReviewedAt: null,
    nextReviewAt: null,
    reviewIntervalDays: 1,
  };
}

export function createLearningTwin(
  studentId: string,
  studentName: string,
): LearningTwin {
  const now = new Date().toISOString();

  return {
    studentId,
    studentName,

    preferredLanguage: "English",
    preferredLearningStyle: "unknown",

    mood: "unknown",
    motivationScore: 70,

    averageConfidence: 50,
    averageMastery: 0,

    strongTopics: [],
    weakTopics: [],

    topics: {},

    createdAt: now,
    updatedAt: now,
  };
}

export async function loadLearningTwin(
  studentId: string,
  studentName = "Student",
): Promise<LearningTwin> {
  try {
    const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

    if (!storedValue) {
      const twin = createLearningTwin(studentId, studentName);
      await saveLearningTwin(twin);
      return twin;
    }

    const twins = JSON.parse(storedValue) as Record<string, LearningTwin>;
    const existingTwin = twins[studentId];

    if (existingTwin) {
      return existingTwin;
    }

    const newTwin = createLearningTwin(studentId, studentName);
    twins[studentId] = newTwin;

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(twins));

    return newTwin;
  } catch (error) {
    console.error("Failed to load Learning Twin:", error);
    return createLearningTwin(studentId, studentName);
  }
}

export async function saveLearningTwin(
  twin: LearningTwin,
): Promise<void> {
  try {
    const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

    const twins: Record<string, LearningTwin> = storedValue
      ? JSON.parse(storedValue)
      : {};

    twins[twin.studentId] = {
      ...twin,
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(twins));
  } catch (error) {
    console.error("Failed to save Learning Twin:", error);
    throw error;
  }
}

function calculateMasteryChange(
  isCorrect: boolean,
  confidence: number,
  hintsUsed: number,
): number {
  const confidenceFactor = clamp(confidence) / 100;
  const hintPenalty = Math.min(hintsUsed * 1.5, 6);

  if (isCorrect) {
    return 8 + confidenceFactor * 4 - hintPenalty;
  }

  return -(5 + confidenceFactor * 3);
}

function calculateNextReview(
  topic: TopicMastery,
  isCorrect: boolean,
): {
  reviewIntervalDays: number;
  nextReviewAt: string;
} {
  let interval = topic.reviewIntervalDays;

  if (!isCorrect) {
    interval = 1;
  } else if (topic.mastery >= 90) {
    interval = Math.min(interval * 2, 60);
  } else if (topic.mastery >= 75) {
    interval = Math.min(Math.ceil(interval * 1.7), 30);
  } else if (topic.mastery >= 50) {
    interval = Math.min(Math.ceil(interval * 1.4), 14);
  } else {
    interval = Math.min(interval + 1, 7);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    reviewIntervalDays: interval,
    nextReviewAt: nextReview.toISOString(),
  };
}

function calculateDifficulty(
  topic: TopicMastery,
  isCorrect: boolean,
): number {
  let difficulty = topic.currentDifficulty;

  if (isCorrect && topic.mastery >= 75) {
    difficulty += 1;
  }

  if (!isCorrect && topic.mastery < 50) {
    difficulty -= 1;
  }

  return clamp(difficulty, 1, 10);
}

function refreshTwinSummary(twin: LearningTwin): LearningTwin {
  const topics = Object.values(twin.topics);

  if (topics.length === 0) {
    return {
      ...twin,
      averageMastery: 0,
      averageConfidence: 50,
      strongTopics: [],
      weakTopics: [],
    };
  }

  const averageMastery =
    topics.reduce((total, topic) => total + topic.mastery, 0) /
    topics.length;

  const averageConfidence =
    topics.reduce((total, topic) => total + topic.confidence, 0) /
    topics.length;

  const strongTopics = topics
    .filter((topic) => topic.mastery >= 75)
    .sort((a, b) => b.mastery - a.mastery)
    .map((topic) => topic.topic);

  const weakTopics = topics
    .filter((topic) => topic.mastery < 50)
    .sort((a, b) => a.mastery - b.mastery)
    .map((topic) => topic.topic);

  return {
    ...twin,
    averageMastery: Math.round(averageMastery),
    averageConfidence: Math.round(averageConfidence),
    strongTopics,
    weakTopics,
    updatedAt: new Date().toISOString(),
  };
}

export async function recordLearningAttempt(
  attempt: LearningAttempt,
  studentName = "Student",
): Promise<LearningTwin> {
  const twin = await loadLearningTwin(
    attempt.studentId,
    studentName,
  );

  const currentTopic =
    twin.topics[attempt.topicId] ??
    createTopic(
      attempt.topicId,
      attempt.subject,
      attempt.topic,
    );

  const hintsUsed = attempt.hintsUsed ?? 0;

  const masteryChange = calculateMasteryChange(
    attempt.isCorrect,
    attempt.confidence,
    hintsUsed,
  );

  const updatedMastery = clamp(
    currentTopic.mastery + masteryChange,
  );

  const updatedConfidence = clamp(
    currentTopic.confidence * 0.7 +
      clamp(attempt.confidence) * 0.3,
  );

  const updatedRetention = clamp(
    updatedMastery * 0.7 + updatedConfidence * 0.3,
  );

  const updatedTopic: TopicMastery = {
    ...currentTopic,

    mastery: Math.round(updatedMastery),
    confidence: Math.round(updatedConfidence),
    retention: Math.round(updatedRetention),

    correctAnswers:
      currentTopic.correctAnswers +
      (attempt.isCorrect ? 1 : 0),

    incorrectAnswers:
      currentTopic.incorrectAnswers +
      (attempt.isCorrect ? 0 : 1),

    totalAttempts: currentTopic.totalAttempts + 1,

    currentDifficulty: calculateDifficulty(
      {
        ...currentTopic,
        mastery: updatedMastery,
      },
      attempt.isCorrect,
    ),

    lastReviewedAt: new Date().toISOString(),

    ...calculateNextReview(
      {
        ...currentTopic,
        mastery: updatedMastery,
      },
      attempt.isCorrect,
    ),
  };

  const updatedTwin = refreshTwinSummary({
    ...twin,
    topics: {
      ...twin.topics,
      [attempt.topicId]: updatedTopic,
    },
  });

  await saveLearningTwin(updatedTwin);

  return updatedTwin;
}

export async function updateStudentMood(
  studentId: string,
  mood: Mood,
  studentName = "Student",
): Promise<LearningTwin> {
  const twin = await loadLearningTwin(studentId, studentName);

  const moodScores: Record<Mood, number> = {
    happy: 90,
    normal: 70,
    tired: 50,
    frustrated: 35,
    sad: 30,
    unknown: 60,
  };

  const updatedTwin: LearningTwin = {
    ...twin,
    mood,
    motivationScore: moodScores[mood],
    updatedAt: new Date().toISOString(),
  };

  await saveLearningTwin(updatedTwin);

  return updatedTwin;
}

export async function updateLearningPreferences(
  studentId: string,
  preferences: {
    preferredLanguage?: LearningLanguage;
    preferredLearningStyle?: LearningStyle;
  },
  studentName = "Student",
): Promise<LearningTwin> {
  const twin = await loadLearningTwin(studentId, studentName);

  const updatedTwin: LearningTwin = {
    ...twin,
    ...preferences,
    updatedAt: new Date().toISOString(),
  };

  await saveLearningTwin(updatedTwin);

  return updatedTwin;
}

export function getTopicsDueForReview(
  twin: LearningTwin,
  currentDate = new Date(),
): TopicMastery[] {
  return Object.values(twin.topics)
    .filter((topic) => {
      if (!topic.nextReviewAt) {
        return false;
      }

      return new Date(topic.nextReviewAt) <= currentDate;
    })
    .sort((a, b) => {
      const firstDate = new Date(
        a.nextReviewAt ?? 0,
      ).getTime();

      const secondDate = new Date(
        b.nextReviewAt ?? 0,
      ).getTime();

      return firstDate - secondDate;
    });
}

export async function resetLearningTwin(
  studentId: string,
): Promise<void> {
  const storedValue = await AsyncStorage.getItem(STORAGE_KEY);

  if (!storedValue) {
    return;
  }

  const twins = JSON.parse(storedValue) as Record<
    string,
    LearningTwin
  >;

  delete twins[studentId];

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(twins),
  );
}