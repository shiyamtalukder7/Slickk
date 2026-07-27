import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { getSlickkApiUrl } from '@/config/api';
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
      'Hello! I am your Slickk Tutor, powered by your local private AI. Tell me what you are studying and I will teach you step by step.',
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

export default function SlickkTutorScreen() {
  const [messages, setMessages] =
    useState<Message[]>(STARTER_MESSAGES);

  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] =
    useState(true);

  const [currentMode, setCurrentMode] =
    useState<TutorMode>('adaptive');

  const [learningTwin, setLearningTwin] =
    useState<LearningTwin | null>(null);

  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    return () => {
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
      id: `tutor-${Date.now()}`,
      role: 'tutor',
      text,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      tutorMessage,
    ]);

    scrollToBottom();
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
      id: `student-${Date.now()}`,
      role: 'student',
      text: messageText,
    };

    const updatedMessages = [
      ...messages,
      studentMessage,
    ];

    setMessages(updatedMessages);
    setInput('');
    setCurrentMode(selectedMode);
    setIsThinking(true);
    scrollToBottom();

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 120000);

    try {
      const response = await fetch(
          getSlickkApiUrl('/api/tutor'),
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          signal: controller.signal,

          body: JSON.stringify({
            message: messageText,
            studentName: 'Student',
            grade: 'Grade 7–8',
            language: 'English',
            mode: selectedMode,

            recentMessages: messages
              .slice(-10)
              .map((message) => ({
                role: message.role,
                text: message.text,
              })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'The tutor request failed.'
        );
      }

      const reply =
        typeof data?.reply === 'string' &&
        data.reply.trim()
          ? data.reply.trim()
          : 'I could not prepare an answer. Please ask another way.';

      addTutorMessage(reply);

      await speakText(reply);

      if (data?.learningTwin) {
        setLearningTwin({
          topic:
            data.learningTwin.topic ||
            'General learning',

          skill:
            data.learningTwin.skill ||
            'Understanding',

          misconception:
            data.learningTwin.misconception ||
            '',

          nextAction:
            data.learningTwin.nextAction ||
            'Continue learning',

          confidence:
            Number(
              data.learningTwin.confidence
            ) || 0,

          masteryDelta:
            Number(
              data.learningTwin.masteryDelta
            ) || 0,
        });
      }
    } catch (error) {
      console.error(
        'Slickk tutor connection error:',
        error
      );

      const errorMessage =
        error instanceof Error &&
        error.name === 'AbortError'
          ? 'The local tutor took too long to answer. Please try a shorter question.'
          : 'I could not connect to the Slickk local AI. Make sure Ollama and the Slickk server are running on your laptop.';

      addTutorMessage(errorMessage);

      await speakText(errorMessage);
    } finally {
      clearTimeout(timeout);
      setIsThinking(false);
    }
  };

  const useLearningMode = (
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
    Alert.alert(
      'Live Voice Tutor',
      'Automatic spoken answers are now active. Microphone listening and hands-free conversation are the next development stage.'
    );
  };

  const openCamera = () => {
    Alert.alert(
      'Camera Learning',
      'Image and handwriting analysis will be connected after the voice tutor is verified.'
    );
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
            onPress={async () => {
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

          <View style={styles.headerCenter}>
            <View style={styles.tutorStatusRow}>
              <View
                style={[
                  styles.onlineDot,
                  isSpeaking &&
                    styles.speakingDot,
                ]}
              />

              <Text style={styles.headerTitle}>
                Slickk Tutor
              </Text>
            </View>

            <Text style={styles.headerSubtitle}>
              {isSpeaking
                ? 'Speaking now'
                : 'Local private intelligence'}
            </Text>
          </View>

          <Pressable
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
              size={22}
              color={
                isSpeechEnabled
                  ? '#081426'
                  : '#70F7D4'
              }
            />
          </Pressable>
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
            <View style={styles.lessonHeader}>
              <View style={styles.lessonIcon}>
                <Ionicons
                  name="infinite-outline"
                  size={25}
                  color="#70F7D4"
                />
              </View>

              <Text style={styles.lessonTitle}>
                Your personal learning space
              </Text>

              <Text
                style={
                  styles.lessonDescription
                }
              >
                Slickk teaches, listens,
                questions, corrects and adapts
                to how you learn.
              </Text>

              <View style={styles.modeRow}>
                {LEARNING_MODES.map(
                  (mode) => (
                    <Pressable
                      key={mode.label}
                      disabled={isThinking}
                      onPress={() =>
                        useLearningMode(
                          mode.mode,
                          mode.prompt
                        )
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.modeButton,
                        currentMode ===
                          mode.mode &&
                          styles.modeButtonSelected,
                        pressed &&
                          styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={mode.icon}
                        size={18}
                        color="#70F7D4"
                      />

                      <Text
                        style={styles.modeText}
                      >
                        {mode.label}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              {learningTwin && (
                <View style={styles.twinCard}>
                  <Text
                    style={styles.twinLabel}
                  >
                    LEARNING TWIN SIGNAL
                  </Text>

                  <Text
                    style={styles.twinTopic}
                  >
                    {learningTwin.topic}
                  </Text>

                  <Text
                    style={styles.twinDetail}
                  >
                    Skill: {learningTwin.skill}
                  </Text>

                  {learningTwin.misconception ? (
                    <Text
                      style={
                        styles.twinWarning
                      }
                    >
                      Possible misconception:{' '}
                      {
                        learningTwin.misconception
                      }
                    </Text>
                  ) : null}

                  <Text
                    style={styles.twinNext}
                  >
                    Next:{' '}
                    {learningTwin.nextAction}
                  </Text>
                </View>
              )}
            </View>
          }
          ListFooterComponent={
            isThinking ? (
              <View
                style={styles.thinkingRow}
              >
                <View
                  style={styles.tutorAvatar}
                >
                  <Ionicons
                    name="sparkles"
                    size={18}
                    color="#081426"
                  />
                </View>

                <View
                  style={
                    styles.thinkingBubble
                  }
                >
                  <ActivityIndicator
                    size="small"
                    color="#70F7D4"
                  />

                  <Text
                    style={
                      styles.thinkingText
                    }
                  >
                    Slickk is thinking...
                  </Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.composerSection}>
          <View style={styles.inputContainer}>
            <Pressable
              onPress={openCamera}
              style={({ pressed }) => [
                styles.inputAction,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="camera-outline"
                size={23}
                color="#70F7D4"
              />
            </Pressable>

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask Slickk anything..."
              placeholderTextColor="#65748A"
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!isThinking}
            />

            {input.trim().length > 0 ? (
              <Pressable
                disabled={isThinking}
                onPress={() =>
                  void sendMessage()
                }
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.pressed,
                ]}
              >
                {isThinking ? (
                  <ActivityIndicator
                    size="small"
                    color="#081426"
                  />
                ) : (
                  <Ionicons
                    name="arrow-up"
                    size={22}
                    color="#081426"
                  />
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={openVoiceTutor}
                style={({ pressed }) => [
                  styles.voiceButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="mic"
                  size={22}
                  color="#081426"
                />
              </Pressable>
            )}
          </View>

          <Text style={styles.composerHint}>
            Answers speak automatically •
            Local Slickk AI
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
        ? 102
        : 74,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 18,
    paddingTop:
      Platform.OS === 'android'
        ? 35
        : 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#15243A',
    backgroundColor: '#081322',
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C192A',
  },

  headerButtonActive: {
    borderColor: '#70F7D4',
    backgroundColor: '#70F7D4',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },

  tutorStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#70F7D4',
  },

  speakingDot: {
    backgroundColor: '#FFD36E',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },

  headerSubtitle: {
    color: '#718096',
    fontSize: 11,
    marginTop: 3,
  },

  messageList: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },

  lessonHeader: {
    padding: 19,
    marginBottom: 25,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1A3544',
    backgroundColor: '#0A202A',
  },

  lessonIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10313A',
  },

  lessonTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 16,
  },

  lessonDescription: {
    color: '#8EA0B4',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },

  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 18,
  },

  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1D3945',
    backgroundColor: '#0D2631',
  },

  modeButtonSelected: {
    borderColor: '#70F7D4',
  },

  modeText: {
    color: '#C7D7DA',
    fontSize: 11,
    fontWeight: '800',
  },

  twinCard: {
    marginTop: 17,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24504D',
    backgroundColor: '#0D292C',
  },

  twinLabel: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  twinTopic: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 7,
  },

  twinDetail: {
    color: '#9DB4B5',
    fontSize: 12,
    marginTop: 5,
  },

  twinWarning: {
    color: '#FFCB7A',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  twinNext: {
    color: '#8EDFCF',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },

  tutorMessageRow: {
    justifyContent: 'flex-start',
  },

  studentMessageRow: {
    justifyContent: 'flex-end',
  },

  tutorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    backgroundColor: '#70F7D4',
  },

  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 19,
  },

  tutorBubble: {
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: '#1A2D43',
    backgroundColor: '#0C192A',
  },

  studentBubble: {
    borderBottomRightRadius: 5,
    backgroundColor: '#70F7D4',
  },

  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  messageName: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  replayButton: {
    width: 30,
    height: 26,
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

  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },

  thinkingBubble: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: '#1A2D43',
    backgroundColor: '#0C192A',
  },

  thinkingText: {
    color: '#95A6B9',
    fontSize: 12,
  },

  composerSection: {
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom:
      Platform.OS === 'android'
        ? 18
        : 12,
    borderTopWidth: 1,
    borderTopColor: '#15243A',
    backgroundColor: '#081322',
  },

  inputContainer: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C192A',
  },

  inputAction: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  input: {
    flex: 1,
    minHeight: 43,
    maxHeight: 120,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 7,
    paddingTop: 11,
    paddingBottom: 10,
  },

  sendButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  voiceButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  composerHint: {
    color: '#506078',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 8,
  },

  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
