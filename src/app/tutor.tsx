import { Ionicons } from '@expo/vector-icons';
import {
  router,
  useLocalSearchParams,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import {
  streamTutorResponse,
  TutorStreamError,
  type TutorTeachingDecision,
} from '@/services/tutor-stream';
import {
  loadStudentProfile,
  type StudentEducationProfile,
} from '@/services/student-profile';
import {
  saveTutorLearningTwin,
} from '@/services/learning-twin';
import {
  resolveSlickkStudentId,
} from '@/services/api-auth';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type MessageRole = 'student' | 'tutor';

type TutorMode =
  | 'adaptive'
  | 'teach'
  | 'hint'
  | 'quiz'
  | 'explain';

type Message = {
  id: string;
  role: MessageRole;
  text: string;
};

type LearningTwin = {
  topic: string;
  skill: string;
  misconception: string;
  nextAction: string;
  confidence: number;
  masteryDelta: number;
};

const STARTER_MESSAGES: Message[] = [
  {
    id: 'welcome-message',
    role: 'tutor',
    text:
      'Hello! I am your Slickk Tutor. Tell me the topic you are studying, or upload a textbook page, and we will learn it together step by step.',
  },
];

const LEARNING_MODES: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  mode: TutorMode;
  prompt: string;
}[] = [
  {
    icon: 'school-outline',
    label: 'Teach me',
    mode: 'teach',
    prompt:
      'Teach me this topic from the beginning, step by step.',
  },
  {
    icon: 'bulb-outline',
    label: 'Give a hint',
    mode: 'hint',
    prompt:
      'Give me a hint without revealing the complete answer.',
  },
  {
    icon: 'help-circle-outline',
    label: 'Quiz me',
    mode: 'quiz',
    prompt:
      'Quiz me with one question at a time.',
  },
];

const buildCompletedTutorHistory = (
  sourceMessages: Message[]
) => {
  const history: Array<{
    role: MessageRole;
    text: string;
  }> = [];

  let pendingStudent: {
    role: 'student';
    text: string;
  } | null = null;

  for (
    const message of sourceMessages.slice(-20)
  ) {
    const text = message.text.trim();

    const shouldIgnore =
      !text ||
      text === 'Preparing a verified answer...' ||
      text.includes('Response stopped.') ||
      text.includes(
        'The local tutor took too long'
      ) ||
      text.includes(
        'I could not connect to Slickk LLM'
      );

    if (shouldIgnore) {
      continue;
    }

    if (message.role === 'student') {
      pendingStudent = {
        role: 'student',
        text,
      };

      continue;
    }

    if (!pendingStudent) {
      continue;
    }

    history.push(
      pendingStudent,
      {
        role: 'tutor',
        text,
      }
    );

    pendingStudent = null;
  }

  return history.slice(-10);
};

export default function SlickkTutorScreen() {
  const insets = useSafeAreaInsets();

  const { subject: requestedSubject, prompt: requestedPrompt } =
    useLocalSearchParams<{ subject?: string; prompt?: string }>();

  const selectedSubject =
    typeof requestedSubject === 'string' &&
    requestedSubject.trim()
      ? requestedSubject.trim()
      : 'General Studies';

  const [studentProfile, setStudentProfile] =
    useState<StudentEducationProfile | null>(null);

  const [messages, setMessages] =
    useState<Message[]>(STARTER_MESSAGES);

  const [input, setInput] = useState(
    typeof requestedPrompt === 'string' ? requestedPrompt : ''
  );
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] =
    useState(true);

  const [currentMode, setCurrentMode] =
    useState<TutorMode>('adaptive');

  const [learningTwin, setLearningTwin] =
    useState<LearningTwin | null>(null);

  const [teachingDecision, setTeachingDecision] =
    useState<TutorTeachingDecision | null>(null);

  const [lessonFit, setLessonFit] = useState<
    'easier' | 'right' | 'harder' | null
  >(null);

  const [conversationId, setConversationId] =
    useState<string | undefined>();

  const [hasReceivedToken, setHasReceivedToken] =
    useState(false);

  const listRef = useRef<FlatList<Message>>(null);
  const activeRequestRef =
    useRef<AbortController | null>(null);

  const messageIdRef = useRef(0);

  const createMessageId = (prefix: string) => {
    messageIdRef.current += 1;

    return `${prefix}-${messageIdRef.current}`;
  };

  useEffect(() => {
    let active = true;

    loadStudentProfile()
      .then((profile) => {
        if (active) {
          setStudentProfile(profile);
        }
      })
      .catch(() => {
        // Keep the tutor usable with safe defaults.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
      void Speech.stop();
    };
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 150);
  };

  const speakText = async (
    text: string,
    forceSpeech = false
  ) => {
    if (!isSpeechEnabled && !forceSpeech) {
      return;
    }

    try {
      await Speech.stop();

      setIsSpeaking(true);

      const safeText = text.slice(
        0,
        Speech.maxSpeechInputLength
      );

      Speech.speak(safeText, {
        language: 'en-US',
        rate: 0.9,
        pitch: 1,
        volume: 1,

        onDone: () => {
          setIsSpeaking(false);
        },

        onStopped: () => {
          setIsSpeaking(false);
        },

        onError: (error) => {
          console.error(
            'Slickk speech error:',
            error
          );

          setIsSpeaking(false);
        },
      });
    } catch (error) {
      console.error(
        'Slickk speech start error:',
        error
      );

      setIsSpeaking(false);
    }
  };

  const stopSpeech = async () => {
    try {
      await Speech.stop();
      setIsSpeaking(false);
    } catch (error) {
      console.error(
        'Slickk speech stop error:',
        error
      );
    }
  };

  const toggleAutomaticSpeech = async () => {
    const nextValue = !isSpeechEnabled;

    setIsSpeechEnabled(nextValue);

    if (!nextValue) {
      await stopSpeech();
    }
  };

  const addTutorMessage = (text: string) => {
    const tutorMessage: Message = {
      id: createMessageId('tutor'),
      role: 'tutor',
      text,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      tutorMessage,
    ]);

    scrollToBottom();
  };

  const updateTutorMessage = (
    messageId: string,
    text: string
  ) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text,
            }
          : message
      )
    );

    scrollToBottom();
  };

  const removeTutorMessage = (
    messageId: string
  ) => {
    setMessages((currentMessages) =>
      currentMessages.filter(
        (message) => message.id !== messageId
      )
    );
  };

  const cancelTutorResponse = () => {
    activeRequestRef.current?.abort();
  };

  const sendMessage = async (
    customMessage?: string,
    selectedMode: TutorMode = currentMode
  ) => {
    const messageText = (
      customMessage ?? input
    ).trim();

    if (!messageText || isThinking) {
      return;
    }

    await stopSpeech();

    const studentMessage: Message = {
      id: createMessageId('student'),
      role: 'student',
      text: messageText,
    };

    const updatedMessages = [
      ...messages,
      studentMessage,
    ];

    const tutorMessageId =
      createMessageId('tutor-stream');

    setMessages([
      ...updatedMessages,
      {
        id: tutorMessageId,
        role: 'tutor',
        text: 'Preparing a verified answer...',
      },
    ]);
    setInput('');
    setCurrentMode(selectedMode);
    setIsThinking(true);
    setHasReceivedToken(false);
    scrollToBottom();

    const controller = new AbortController();
    activeRequestRef.current = controller;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 300000);

    try {
      const studentId =
        await resolveSlickkStudentId();

      const completed = await streamTutorResponse(
        {
          message: messageText,
          studentName:
            studentProfile?.studentName ?? 'Student',
          studentId,
          conversationId,
          grade:
            studentProfile?.grade ?? 'Class 7',
          language:
            studentProfile?.teachingLanguage ??
            'english',
          curriculum:
            studentProfile?.curriculumTrack ??
            'nctb-english-version',
          subject: selectedSubject,
          topic: messageText.slice(0, 120),
          school: studentProfile?.school.name,
          channel: 'typed',
          mode: selectedMode,
          recentMessages:
            buildCompletedTutorHistory(messages),
          difficulty:
            lessonFit === 'easier'
              ? 'easy'
              : lessonFit === 'harder'
                ? 'hard'
                : undefined,
          performance:
            lessonFit === 'easier'
              ? 0.25
              : lessonFit === 'harder'
                ? 0.9
                : lessonFit === 'right'
                  ? 0.65
                  : undefined,
        },
        controller.signal,
        {
          onStart: (event) => {
            setConversationId(
              event.conversationId ||
              undefined
            );
          },
          onToken: () => {
            setHasReceivedToken(true);
          },
          onComplete: (event) => {
            setConversationId(
              event.conversationId ||
              undefined
            );
          },
        }
      );

      const reply = completed.reply.trim();

      updateTutorMessage(tutorMessageId, reply);
      setTeachingDecision(
        completed.metadata.teachingDecision
      );
      setLessonFit(null);

      if (
        completed.metadata.grounded &&
        completed.learningTwin
      ) {
        const twinUpdate: LearningTwin = {
          topic:
            completed.learningTwin.topic ||
            'General learning',

          skill:
            completed.learningTwin.skill ||
            'Understanding',

          misconception:
            completed.learningTwin.misconception ||
            '',

          nextAction:
            completed.learningTwin.nextAction ||
            'Continue learning',

          confidence:
            Number(
              completed.learningTwin.confidence
            ) || 0,

          masteryDelta:
            Number(
              completed.learningTwin.masteryDelta
            ) || 0,
        };

        setLearningTwin(twinUpdate);

        await saveTutorLearningTwin(
          twinUpdate
        );
      } else {
        setLearningTwin(null);
      }

      await speakText(reply);
    } catch (error) {
      console.error(
        'Slickk tutor streaming error:',
        error
      );

      const wasCancelled =
        controller.signal.aborted && !timedOut;

      const shouldResetConversation =
        error instanceof TutorStreamError &&
        (
          error.code === 'HTTP_400' ||
          error.code
            .toUpperCase()
            .includes('CONVERSATION')
        );

      if (shouldResetConversation) {
        setConversationId(undefined);
      }

      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message.id !== tutorMessageId &&
            message.id !== studentMessage.id
        )
      );

      if (!wasCancelled) {
        const errorMessage = timedOut
          ? 'The local tutor took too long to answer. Please try again.'
          : error instanceof TutorStreamError
            ? error.message
            : 'I could not connect to Slickk LLM. Make sure the Slickk server and its configured local runtime are running.';

        Alert.alert(
          'Slickk could not finish',
          errorMessage,
          [
            {
              text: 'Not now',
              style: 'cancel',
            },
            {
              text: 'Restore question',
              onPress: () => {
                setInput(messageText);
              },
            },
          ]
        );
      }
    } finally {
      clearTimeout(timeout);

      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }

      setIsThinking(false);
      setHasReceivedToken(false);
    }
  };

  const applyLearningMode = (
    mode: TutorMode,
    prompt: string
  ) => {
    setCurrentMode(mode);

    const latestStudentQuestion = [
      ...messages,
    ]
      .reverse()
      .find(
        (message) =>
          message.role === 'student'
      );

    if (!latestStudentQuestion) {
      const guidance =
        'Ask me about a topic first, then select this learning mode.';

      addTutorMessage(guidance);
      void speakText(guidance);
      return;
    }

    void sendMessage(
      `${prompt}\n\nTopic: ${latestStudentQuestion.text}`,
      mode
    );
  };

  const openVoiceTutor = () => {
    router.push({
      pathname: '/live-tutor',
      params: {
        subject: selectedSubject,
      },
    });
  };

  const openCamera = () => {
    router.push({
      pathname: '/camera-learn',
      params: {
        mode: 'camera',
        subject: selectedSubject,
      },
    });
  };

  const renderMessage = ({
    item,
  }: {
    item: Message;
  }) => {
    const isStudent =
      item.role === 'student';

    return (
      <View
        style={[
          styles.messageRow,
          isStudent
            ? styles.studentMessageRow
            : styles.tutorMessageRow,
        ]}
      >
        {!isStudent && (
          <View style={styles.tutorAvatar}>
            <Ionicons
              name="sparkles"
              size={18}
              color="#081426"
            />
          </View>
        )}

        <View
          style={[
            styles.messageBubble,
            isStudent
              ? styles.studentBubble
              : styles.tutorBubble,
          ]}
        >
          {!isStudent && (
            <View style={styles.messageHeader}>
              <Text style={styles.messageName}>
                SLICKK TUTOR
              </Text>

              <Pressable
                onPress={() =>
                  void speakText(
                    item.text,
                    true
                  )
                }
                style={({ pressed }) => [
                  styles.replayButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="volume-medium-outline"
                  size={18}
                  color="#70F7D4"
                />
              </Pressable>
            </View>
          )}

          <Text
            style={[
              styles.messageText,
              isStudent &&
                styles.studentMessageText,
            ]}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to Student Home"
            onPress={async () => {
              activeRequestRef.current?.abort();
              await stopSpeech();
              router.back();
            }}
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

          <View style={styles.headerTextBlock}>
            <Text style={styles.subjectLabel}>
              CURRENT SUBJECT
            </Text>

            <Text
              style={styles.headerTitle}
              numberOfLines={1}
            >
              {selectedSubject}
            </Text>

            <View style={styles.headerStatusRow}>
              <View
                style={[
                  styles.statusDot,
                  isSpeaking &&
                    styles.speakingDot,
                ]}
              />

              <Text style={styles.headerSubtitle}>
                {isThinking
                  ? hasReceivedToken
                    ? 'Finalizing your answer'
                    : 'Checking trusted lesson sources'
                  : isSpeaking
                    ? 'Speaking now'
                    : 'Ready to teach'}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isSpeechEnabled
                ? 'Turn automatic speech off'
                : 'Turn automatic speech on'
            }
            onPress={() =>
              void toggleAutomaticSpeech()
            }
            style={({ pressed }) => [
              styles.headerButton,
              isSpeechEnabled &&
                styles.headerButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={
                isSpeechEnabled
                  ? 'volume-high-outline'
                  : 'volume-mute-outline'
              }
              size={21}
              color={
                isSpeechEnabled
                  ? '#081426'
                  : '#70F7D4'
              }
            />
          </Pressable>
        </View>

        <View style={styles.sourceCard}>
          <View style={styles.sourceIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color="#70F7D4"
            />
          </View>

          <View style={styles.sourceCopy}>
            <Text style={styles.sourceLabel}>
              TRUSTED SOURCE CHECK ACTIVE
            </Text>

            <Text style={styles.sourceTitle}>
              Curriculum-grounded lesson
            </Text>

            <Text style={styles.sourceDescription}>
              Slickk checks approved local lesson
              material before displaying an answer.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload a textbook page"
            onPress={openCamera}
            style={({ pressed }) => [
              styles.uploadButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="camera-outline"
              size={18}
              color="#081426"
            />

            <Text style={styles.uploadButtonText}>
              Upload
            </Text>
          </Pressable>
        </View>

        <View style={styles.modeSection}>
          <Text style={styles.modeLabel}>
            HOW SHOULD SLICKK HELP?
          </Text>

          <View style={styles.modeRow}>
            {LEARNING_MODES.map((mode) => {
              const isSelected =
                currentMode === mode.mode;

              return (
                <Pressable
                  key={mode.label}
                  disabled={isThinking}
                  onPress={() =>
                    applyLearningMode(
                      mode.mode,
                      mode.prompt
                    )
                  }
                  style={({ pressed }) => [
                    styles.modeButton,
                    isSelected &&
                      styles.modeButtonSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={mode.icon}
                    size={17}
                    color={
                      isSelected
                        ? '#081426'
                        : '#70F7D4'
                    }
                  />

                  <Text
                    style={[
                      styles.modeText,
                      isSelected &&
                        styles.modeTextSelected,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            styles.messageList
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
          ListHeaderComponent={
            <View style={styles.introCard}>
              <View style={styles.introIcon}>
                <Ionicons
                  name="sparkles"
                  size={20}
                  color="#081426"
                />
              </View>

              <View style={styles.introCopy}>
                <Text style={styles.introTitle}>
                  Your personal lesson
                </Text>

                <Text style={styles.introText}>
                  Ask a question, choose a learning
                  mode, or upload the textbook page
                  you are studying.
                </Text>
              </View>
            </View>
          }
          ListFooterComponent={
            <>
              {teachingDecision ? (
                <View style={styles.adaptiveCard}>
                  <View style={styles.adaptiveHeader}>
                    <Ionicons name="git-branch-outline" size={18} color="#70F7D4" />
                    <View style={styles.adaptiveHeaderCopy}>
                      <Text style={styles.twinLabel}>WHY SLICKK TAUGHT THIS WAY</Text>
                      <Text style={styles.adaptiveMethod}>
                        {teachingDecision.method.replaceAll('-', ' ')} • {teachingDecision.difficulty}
                      </Text>
                    </View>
                    <View style={[styles.groundingBadge, !teachingDecision.grounded && styles.modelBadge]}>
                      <Text style={styles.groundingText}>
                        {teachingDecision.grounded ? 'SOURCE CHECKED' : 'MODEL ONLY'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.adaptiveReason}>{teachingDecision.reason}</Text>
                  {teachingDecision.roadmap ? (
                    <View style={styles.roadmapCard}>
                      <View style={styles.roadmapHeading}>
                        <Text style={styles.roadmapTitle}>{teachingDecision.roadmap.title}</Text>
                        <Text style={styles.paceBadge}>{teachingDecision.roadmap.sessionMinutes} MIN • {teachingDecision.roadmap.pace.toUpperCase()}</Text>
                      </View>
                      <View style={styles.roadmapSteps}>
                        {teachingDecision.roadmap.phases.map((phase) => (
                          <View key={phase.key} style={styles.roadmapStep}>
                            <Ionicons
                              name={phase.status === 'complete' ? 'checkmark-circle' : phase.status === 'current' ? 'radio-button-on' : 'ellipse-outline'}
                              size={16}
                              color={phase.status === 'upcoming' ? '#52657D' : '#70F7D4'}
                            />
                            <Text style={[styles.roadmapStepText, phase.status === 'current' && styles.roadmapStepCurrent]}>{phase.label}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={styles.successCriterion}>SUCCESS: {teachingDecision.roadmap.successCriterion}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.fitQuestion}>How did that lesson feel?</Text>

                  <View style={styles.fitActions}>
                    {([
                      ['easier', 'Too hard'],
                      ['right', 'Just right'],
                      ['harder', 'Too easy'],
                    ] as const).map(([value, label]) => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: lessonFit === value }}
                        onPress={() => setLessonFit(value)}
                        style={({ pressed }) => [
                          styles.fitButton,
                          lessonFit === value && styles.fitButtonSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.fitButtonText,
                          lessonFit === value && styles.fitButtonTextSelected,
                        ]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {lessonFit ? (
                    <Text style={styles.adaptationNotice}>
                      Next response will be {lessonFit === 'easier' ? 'slower with more scaffolding' : lessonFit === 'harder' ? 'more challenging and independent' : 'kept at this level'}.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {learningTwin ? (
                <View style={styles.twinStrip}>
                  <View style={styles.twinStripIcon}>
                    <Ionicons
                      name="analytics-outline"
                      size={19}
                      color="#70F7D4"
                    />
                  </View>

                  <View style={styles.twinStripCopy}>
                    <Text style={styles.twinLabel}>
                      LEARNING TWIN UPDATE
                    </Text>

                    <Text style={styles.twinTopic}>
                      {learningTwin.topic}
                    </Text>

                    <Text
                      style={styles.twinNext}
                      numberOfLines={2}
                    >
                      Next: {learningTwin.nextAction}
                    </Text>
                  </View>
                </View>
              ) : null}

              {isThinking &&
              !hasReceivedToken ? (
                <View style={styles.thinkingRow}>
                  <View style={styles.tutorAvatar}>
                    <Ionicons
                      name="sparkles"
                      size={17}
                      color="#081426"
                    />
                  </View>

                  <View style={styles.thinkingBubble}>
                    <ActivityIndicator
                      size="small"
                      color="#70F7D4"
                    />

                    <Text style={styles.thinkingText}>
                      Checking lesson material...
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          }
        />

        <View
          style={[
            styles.composerSection,
            {
              paddingBottom: Math.max(
                insets.bottom,
                14
              ),
            },
          ]}
        >
          <View style={styles.inputContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload textbook page"
              onPress={openCamera}
              style={({ pressed }) => [
                styles.inputAction,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="camera-outline"
                size={22}
                color="#70F7D4"
              />
            </Pressable>

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about this lesson..."
              placeholderTextColor="#65748A"
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!isThinking}
            />

            {isThinking ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop tutor response"
                onPress={cancelTutorResponse}
                style={({ pressed }) => [
                  styles.stopResponseButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="stop"
                  size={20}
                  color="#FFFFFF"
                />
              </Pressable>
            ) : input.trim().length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send question"
                onPress={() =>
                  void sendMessage()
                }
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={22}
                  color="#081426"
                />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open live voice tutor"
                onPress={openVoiceTutor}
                style={({ pressed }) => [
                  styles.voiceButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="mic"
                  size={21}
                  color="#081426"
                />
              </Pressable>
            )}
          </View>

          <Text style={styles.composerHint}>
            Complete verified answers only | Local Slickk AI
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07101E',
  },

  keyboardView: {
    flex: 1,
  },

  header: {
    minHeight:
      Platform.OS === 'android'
        ? 96
        : 72,
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === 'android'
        ? 30
        : 8,
    paddingBottom: 12,
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

  headerButtonActive: {
    backgroundColor: '#70F7D4',
    borderColor: '#70F7D4',
  },

  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
  },

  subjectLabel: {
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

  headerStatusRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
    backgroundColor: '#70F7D4',
  },

  speakingDot: {
    backgroundColor: '#FFD36E',
  },

  headerSubtitle: {
    flex: 1,
    color: '#7E90A6',
    fontSize: 10,
  },

  sourceCard: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 13,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B2029',
    borderWidth: 1,
    borderColor: '#1E484B',
  },

  sourceIcon: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  sourceCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },

  sourceLabel: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  sourceTitle: {
    marginTop: 2,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },

  sourceDescription: {
    marginTop: 3,
    color: '#82999E',
    fontSize: 10,
    lineHeight: 15,
  },

  uploadButton: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#70F7D4',
  },

  uploadButtonText: {
    color: '#081426',
    fontSize: 10,
    fontWeight: '800',
  },

  modeSection: {
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 5,
  },

  modeLabel: {
    color: '#71849B',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  modeRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },

  modeButton: {
    flex: 1,
    minHeight: 39,
    paddingHorizontal: 7,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#21344B',
  },

  modeButtonSelected: {
    backgroundColor: '#70F7D4',
    borderColor: '#70F7D4',
  },

  modeText: {
    color: '#C6D2DE',
    fontSize: 10,
    fontWeight: '700',
  },

  modeTextSelected: {
    color: '#081426',
  },

  messageList: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 22,
  },

  introCard: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1728',
    borderWidth: 1,
    borderColor: '#1A2D43',
  },

  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  introCopy: {
    flex: 1,
    marginLeft: 11,
  },

  introTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  introText: {
    marginTop: 4,
    color: '#7F91A7',
    fontSize: 11,
    lineHeight: 17,
  },

  messageRow: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  tutorMessageRow: {
    justifyContent: 'flex-start',
  },

  studentMessageRow: {
    justifyContent: 'flex-end',
  },

  tutorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  messageBubble: {
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
  },

  tutorBubble: {
    borderBottomLeftRadius: 5,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1A2D43',
  },

  studentBubble: {
    borderBottomRightRadius: 5,
    backgroundColor: '#70F7D4',
  },

  messageHeader: {
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  messageName: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  replayButton: {
    width: 28,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },

  messageText: {
    color: '#DCE5F0',
    fontSize: 14,
    lineHeight: 21,
  },

  studentMessageText: {
    color: '#081426',
    fontWeight: '700',
  },

  adaptiveCard: {
    marginTop: 4,
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#101D30',
    borderWidth: 1,
    borderColor: '#29405D',
  },

  adaptiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  adaptiveHeaderCopy: {
    flex: 1,
  },

  adaptiveMethod: {
    marginTop: 3,
    color: '#F5F8FC',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'capitalize',
  },

  groundingBadge: {
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: '#17473D',
  },

  modelBadge: {
    backgroundColor: '#47351A',
  },

  groundingText: {
    color: '#D5FFF3',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  adaptiveReason: {
    marginTop: 10,
    color: '#9BACBF',
    fontSize: 11,
    lineHeight: 17,
  },

  roadmapCard: {
    marginTop: 12, padding: 12, borderRadius: 14,
    backgroundColor: '#091828', borderWidth: 1, borderColor: '#203A4D',
  },
  roadmapTitle: { color: '#F5F8FC', fontSize: 13, fontWeight: '900' },
  roadmapHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  paceBadge: { color: '#70F7D4', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  roadmapSteps: { marginTop: 9, gap: 7 },
  roadmapStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roadmapStepText: { color: '#6E8197', fontSize: 10, fontWeight: '700' },
  roadmapStepCurrent: { color: '#D5FFF3' },
  successCriterion: {
    marginTop: 10, color: '#70F7D4', fontSize: 9, lineHeight: 14,
    fontWeight: '800', letterSpacing: 0.3,
  },

  fitQuestion: {
    marginTop: 12,
    color: '#DCE5F0',
    fontSize: 11,
    fontWeight: '800',
  },

  fitActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 7,
  },

  fitButton: {
    flex: 1,
    minHeight: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#344A64',
    backgroundColor: '#0A1525',
  },

  fitButtonSelected: {
    borderColor: '#70F7D4',
    backgroundColor: '#173B38',
  },

  fitButtonText: {
    color: '#9CACBF',
    fontSize: 9,
    fontWeight: '800',
  },

  fitButtonTextSelected: {
    color: '#CFFFF2',
  },

  adaptationNotice: {
    marginTop: 9,
    color: '#70F7D4',
    fontSize: 10,
    lineHeight: 15,
  },

  twinStrip: {
    marginTop: 4,
    marginBottom: 14,
    padding: 13,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0D292C',
    borderWidth: 1,
    borderColor: '#24504D',
  },

  twinStripIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      'rgba(112, 247, 212, 0.09)',
  },

  twinStripCopy: {
    flex: 1,
    marginLeft: 10,
  },

  twinLabel: {
    color: '#70F7D4',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  twinTopic: {
    marginTop: 3,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },

  twinNext: {
    marginTop: 3,
    color: '#8EDFCF',
    fontSize: 10,
    lineHeight: 15,
  },

  thinkingRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  thinkingBubble: {
    minHeight: 43,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderBottomLeftRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1A2D43',
  },

  thinkingText: {
    color: '#95A6B9',
    fontSize: 11,
  },

  composerSection: {
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom:
      Platform.OS === 'android'
        ? 14
        : 10,
    backgroundColor: '#081322',
    borderTopWidth: 1,
    borderTopColor: '#15243A',
  },

  inputContainer: {
    minHeight: 57,
    padding: 7,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#203047',
  },

  inputAction: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    paddingHorizontal: 7,
    paddingTop: 10,
    paddingBottom: 9,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },

  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  stopResponseButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D94B5B',
  },

  voiceButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  composerHint: {
    marginTop: 7,
    color: '#506078',
    fontSize: 9,
    textAlign: 'center',
  },

  pressed: {
    opacity: 0.72,
    transform: [
      {
        scale: 0.98,
      },
    ],
  },
});
