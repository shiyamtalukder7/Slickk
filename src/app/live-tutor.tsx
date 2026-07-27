import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';

type MessageRole = 'student' | 'tutor';

type Message = {
  id: string;
  role: MessageRole;
  text: string;
};

type LiveState =
  | 'idle'
  | 'permission'
  | 'listening'
  | 'hearing'
  | 'thinking'
  | 'speaking'
  | 'error';

type LearningTwin = {
  topic: string;
  skill: string;
  misconception: string;
  nextAction: string;
  confidence: number;
  masteryDelta: number;
};

const SERVER_URL = 'http://192.168.1.172:3000';

const STARTER_MESSAGES: Message[] = [
  {
    id: 'live-welcome',
    role: 'tutor',
    text:
      'Live Tutor is ready. Tap Start live session, then speak naturally. I will listen, answer and automatically listen again.',
  },
];

function containsBangla(text: string) {
  return /[\u0980-\u09FF]/.test(text);
}

function speechLanguage(text: string) {
  return containsBangla(text)
    ? 'bn-BD'
    : 'en-US';
}

function splitSpeechText(
  text: string,
  maximumLength = 2800
) {
  const cleanText = text
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    return [];
  }

  const sentences =
    cleanText.match(/[^.!?।]+[.!?।]?/g) ?? [
      cleanText,
    ];

  const chunks: string[] = [];
  let currentChunk = '';

  sentences.forEach((sentence) => {
    const nextChunk = currentChunk
      ? `${currentChunk} ${sentence.trim()}`
      : sentence.trim();

    if (
      nextChunk.length <= maximumLength
    ) {
      currentChunk = nextChunk;
      return;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (
      sentence.trim().length <=
      maximumLength
    ) {
      currentChunk = sentence.trim();
      return;
    }

    const longSentence = sentence.trim();

    for (
      let index = 0;
      index < longSentence.length;
      index += maximumLength
    ) {
      chunks.push(
        longSentence.slice(
          index,
          index + maximumLength
        )
      );
    }

    currentChunk = '';
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function liveStateLabel(state: LiveState) {
  switch (state) {
    case 'permission':
      return 'Requesting microphone access';

    case 'listening':
      return 'Listening';

    case 'hearing':
      return 'Hearing your voice';

    case 'thinking':
      return 'Slickk is thinking';

    case 'speaking':
      return 'Slickk is speaking';

    case 'error':
      return 'Voice connection problem';

    default:
      return 'Ready';
  }
}

export default function LiveTutorScreen() {
  const [messages, setMessages] =
    useState<Message[]>(STARTER_MESSAGES);

  const [liveState, setLiveState] =
    useState<LiveState>('idle');

  const [handsFree, setHandsFree] =
    useState(false);

  const [recognizing, setRecognizing] =
    useState(false);

  const [interimTranscript, setInterimTranscript] =
    useState('');

  const [typedInput, setTypedInput] =
    useState('');

  const [recognitionLanguage, setRecognitionLanguage] =
    useState<'en-US' | 'bn-BD'>('en-US');

  const [speechRate, setSpeechRate] =
    useState(0.9);

  const [volumeLevel, setVolumeLevel] =
    useState(-2);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [learningTwin, setLearningTwin] =
    useState<LearningTwin | null>(null);

  const listRef =
    useRef<FlatList<Message>>(null);

  const messagesRef =
    useRef<Message[]>(STARTER_MESSAGES);

  const handsFreeRef = useRef(false);
  const recognizingRef = useRef(false);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const mountedRef = useRef(true);
  const restartTimerRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const speechSessionRef = useRef(0);

  const lastFinalResultRef = useRef({
    text: '',
    time: 0,
  });

  const speechRateRef = useRef(0.9);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    recognizingRef.current =
      recognizing;
  }, [recognizing]);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (restartTimerRef.current) {
        clearTimeout(
          restartTimerRef.current
        );
      }

      speechSessionRef.current += 1;

      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Recognition was already inactive.
      }

      void Speech.stop();
    };
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 120);
  };

  const appendMessage = (
    role: MessageRole,
    text: string
  ) => {
    const newMessage: Message = {
      id: `${role}-${Date.now()}-${Math.random()}`,
      role,
      text,
    };

    setMessages((currentMessages) => {
      const nextMessages = [
        ...currentMessages,
        newMessage,
      ];

      messagesRef.current =
        nextMessages;

      return nextMessages;
    });

    scrollToBottom();
  };

  const scheduleListeningRestart = (
    delay = 650
  ) => {
    if (restartTimerRef.current) {
      clearTimeout(
        restartTimerRef.current
      );
    }

    restartTimerRef.current =
      setTimeout(() => {
        if (
          mountedRef.current &&
          handsFreeRef.current &&
          !processingRef.current &&
          !speakingRef.current &&
          !recognizingRef.current
        ) {
          void startListening();
        }
      }, delay);
  };

  const finishSpeaking = () => {
    speakingRef.current = false;

    if (!mountedRef.current) {
      return;
    }

    setLiveState('idle');

    if (handsFreeRef.current) {
      scheduleListeningRestart(500);
    }
  };

  const speakChunks = (
    chunks: string[],
    index: number,
    session: number,
    language: string
  ) => {
    if (
      session !==
        speechSessionRef.current ||
      !mountedRef.current
    ) {
      return;
    }

    if (index >= chunks.length) {
      finishSpeaking();
      return;
    }

    Speech.speak(chunks[index], {
      language,
      rate: speechRateRef.current,
      pitch: 1,
      volume: 1,

      onDone: () => {
        speakChunks(
          chunks,
          index + 1,
          session,
          language
        );
      },

      onStopped: () => {
        if (
          session ===
          speechSessionRef.current
        ) {
          finishSpeaking();
        }
      },

      onError: (error) => {
        console.error(
          'Live tutor speech error:',
          error
        );

        if (
          session ===
          speechSessionRef.current
        ) {
          finishSpeaking();
        }
      },
    });
  };

  const speakTutorReply = async (
    text: string
  ) => {
    try {
      if (recognizingRef.current) {
        ExpoSpeechRecognitionModule.abort();
      }
    } catch {
      // Recognition was already stopped.
    }

    await Speech.stop();

    const chunks = splitSpeechText(
      text,
      Math.min(
        2800,
        Speech.maxSpeechInputLength
      )
    );

    if (chunks.length === 0) {
      finishSpeaking();
      return;
    }

    speechSessionRef.current += 1;

    const currentSession =
      speechSessionRef.current;

    speakingRef.current = true;
    setLiveState('speaking');

    speakChunks(
      chunks,
      0,
      currentSession,
      speechLanguage(text)
    );
  };

  const stopSpeechOnly = async () => {
    speechSessionRef.current += 1;
    speakingRef.current = false;

    await Speech.stop();

    if (mountedRef.current) {
      setLiveState('idle');
    }
  };

  const ensurePermissions = async () => {
    setLiveState('permission');
    setErrorMessage('');

    const existingPermission =
      await ExpoSpeechRecognitionModule.getPermissionsAsync();

    if (existingPermission.granted) {
      return true;
    }

    const requestedPermission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();

    if (!requestedPermission.granted) {
      setLiveState('error');
      setErrorMessage(
        'Microphone permission was not granted. Open Android Settings, find Slickk and allow Microphone access.'
      );

      return false;
    }

    return true;
  };

  const startListening = async () => {
    if (
      recognizingRef.current ||
      processingRef.current ||
      speakingRef.current
    ) {
      return;
    }

    try {
      const permissionGranted =
        await ensurePermissions();

      if (!permissionGranted) {
        return;
      }

      setErrorMessage('');
      setInterimTranscript('');
      setLiveState('listening');

      ExpoSpeechRecognitionModule.start({
        lang: recognitionLanguage,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        volumeChangeEventOptions: {
          enabled: true,
          intervalMillis: 250,
        },
      });
    } catch (error) {
      console.error(
        'Unable to start recognition:',
        error
      );

      setLiveState('error');
      setErrorMessage(
        'The speech recognizer could not start. Check that the new development APK is installed.'
      );
    }
  };

  const stopListening = (
    processFinalResult = true
  ) => {
    try {
      if (processFinalResult) {
        ExpoSpeechRecognitionModule.stop();
      } else {
        ExpoSpeechRecognitionModule.abort();
      }
    } catch {
      // Recognition was not active.
    }
  };

  const stopLiveSession = async () => {
    setHandsFree(false);
    handsFreeRef.current = false;
    processingRef.current = false;

    if (restartTimerRef.current) {
      clearTimeout(
        restartTimerRef.current
      );
    }

    stopListening(false);
    await stopSpeechOnly();

    setRecognizing(false);
    recognizingRef.current = false;
    setInterimTranscript('');
    setVolumeLevel(-2);
    setLiveState('idle');
  };

  const startLiveSession = async () => {
    setHandsFree(true);
    handsFreeRef.current = true;

    if (speakingRef.current) {
      await stopSpeechOnly();
    }

    await startListening();
  };

  const repeatLastTutorReply = async () => {
    const latestTutorMessage = [
      ...messagesRef.current,
    ]
      .reverse()
      .find(
        (message) =>
          message.role === 'tutor'
      );

    if (!latestTutorMessage) {
      return;
    }

    await speakTutorReply(
      latestTutorMessage.text
    );
  };

  const processVoiceCommand = async (
    transcript: string
  ) => {
    const command = transcript
      .toLowerCase()
      .replace(/[.,!?।]/g, '')
      .trim();

    const stopCommands = [
      'stop',
      'stop listening',
      'end session',
      'থামো',
      'বন্ধ করো',
    ];

    if (
      stopCommands.some(
        (item) => command === item
      )
    ) {
      await stopLiveSession();
      return true;
    }

    const repeatCommands = [
      'repeat',
      'say that again',
      'repeat that',
      'আবার বলো',
    ];

    if (
      repeatCommands.some(
        (item) => command === item
      )
    ) {
      processingRef.current = false;
      await repeatLastTutorReply();
      return true;
    }

    const slowerCommands = [
      'slower',
      'speak slower',
      'speak slowly',
      'ধীরে বলো',
    ];

    if (
      slowerCommands.some(
        (item) => command === item
      )
    ) {
      setSpeechRate(0.72);
      speechRateRef.current = 0.72;
      processingRef.current = false;

      await repeatLastTutorReply();
      return true;
    }

    const normalSpeedCommands = [
      'normal speed',
      'speak normally',
      'স্বাভাবিকভাবে বলো',
    ];

    if (
      normalSpeedCommands.some(
        (item) => command === item
      )
    ) {
      setSpeechRate(0.9);
      speechRateRef.current = 0.9;
      processingRef.current = false;

      appendMessage(
        'tutor',
        'Voice speed is back to normal.'
      );

      await speakTutorReply(
        'Voice speed is back to normal.'
      );

      return true;
    }

    return false;
  };

  const sendToTutor = async (
    studentText: string
  ) => {
    const cleanText = studentText.trim();

    if (!cleanText) {
      processingRef.current = false;

      if (handsFreeRef.current) {
        scheduleListeningRestart();
      }

      return;
    }

    processingRef.current = true;

    stopListening(false);
    await Speech.stop();

    setInterimTranscript('');
    setLiveState('thinking');
    setErrorMessage('');

    const wasCommand =
      await processVoiceCommand(cleanText);

    if (wasCommand) {
      return;
    }

    appendMessage(
      'student',
      cleanText
    );

    const controller =
      new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 180000);

    try {
      const recentMessages =
        messagesRef.current
          .slice(-12)
          .map((message) => ({
            role: message.role,
            text: message.text,
          }));

      const response = await fetch(
        `${SERVER_URL}/api/tutor`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          signal: controller.signal,

          body: JSON.stringify({
            message: cleanText,
            studentName: 'Student',
            grade: 'Grade 7–8',
            language:
              recognitionLanguage ===
              'bn-BD'
                ? 'Bengali or Banglish'
                : 'English or Banglish',
            mode: 'adaptive',
            recentMessages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            'The local tutor request failed.'
        );
      }

      const reply =
        typeof data?.reply === 'string' &&
        data.reply.trim()
          ? data.reply.trim()
          : 'I could not prepare an answer. Please ask again another way.';

      appendMessage('tutor', reply);

      if (data?.learningTwin) {
        setLearningTwin({
          topic:
            data.learningTwin.topic ??
            'General learning',

          skill:
            data.learningTwin.skill ??
            'Understanding',

          misconception:
            data.learningTwin
              .misconception ?? '',

          nextAction:
            data.learningTwin
              .nextAction ??
            'Continue learning',

          confidence:
            Number(
              data.learningTwin
                .confidence
            ) || 0,

          masteryDelta:
            Number(
              data.learningTwin
                .masteryDelta
            ) || 0,
        });
      }

      processingRef.current = false;

      await speakTutorReply(reply);
    } catch (error) {
      console.error(
        'Live tutor request error:',
        error
      );

      const responseMessage =
        error instanceof Error &&
        error.name === 'AbortError'
          ? 'The local tutor took too long to answer. Please ask a shorter question.'
          : 'I could not connect to the Slickk intelligence server. Make sure Ollama and node index.js are running on the laptop.';

      appendMessage(
        'tutor',
        responseMessage
      );

      processingRef.current = false;

      await speakTutorReply(
        responseMessage
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const submitTypedInput = async () => {
    const text = typedInput.trim();

    if (!text || processingRef.current) {
      return;
    }

    setTypedInput('');
    await sendToTutor(text);
  };

  const interruptTutor = async () => {
    await stopSpeechOnly();

    setHandsFree(true);
    handsFreeRef.current = true;

    scheduleListeningRestart(150);
  };

  useSpeechRecognitionEvent(
    'start',
    () => {
      recognizingRef.current = true;
      setRecognizing(true);
      setLiveState('listening');
      setErrorMessage('');
    }
  );

  useSpeechRecognitionEvent(
    'end',
    () => {
      recognizingRef.current = false;
      setRecognizing(false);
      setVolumeLevel(-2);

      if (
        handsFreeRef.current &&
        !processingRef.current &&
        !speakingRef.current
      ) {
        scheduleListeningRestart(700);
      }
    }
  );

  useSpeechRecognitionEvent(
    'result',
    (event) => {
      const transcript =
        event.results?.[0]?.transcript?.trim() ??
        '';

      if (!transcript) {
        return;
      }

      setInterimTranscript(transcript);
      setLiveState('hearing');

      if (!event.isFinal) {
        return;
      }

      const now = Date.now();
      const previous =
        lastFinalResultRef.current;

      if (
        previous.text === transcript &&
        now - previous.time < 1800
      ) {
        return;
      }

      lastFinalResultRef.current = {
        text: transcript,
        time: now,
      };

      processingRef.current = true;
      setInterimTranscript('');

      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Recognition already ended.
      }

      void sendToTutor(transcript);
    }
  );

  useSpeechRecognitionEvent(
    'volumechange',
    (event) => {
      setVolumeLevel(event.value);
    }
  );

  useSpeechRecognitionEvent(
    'error',
    (event) => {
      recognizingRef.current = false;
      setRecognizing(false);
      setVolumeLevel(-2);

      const harmlessErrors = [
        'aborted',
        'no-speech',
        'speech-timeout',
      ];

      if (
        harmlessErrors.includes(
          event.error
        )
      ) {
        if (
          handsFreeRef.current &&
          !processingRef.current &&
          !speakingRef.current
        ) {
          scheduleListeningRestart(650);
        }

        return;
      }

      console.error(
        'Speech recognition error:',
        event.error,
        event.message
      );

      setLiveState('error');

      const readableError =
        event.error === 'not-allowed'
          ? 'Microphone permission is blocked. Allow microphone access in Android Settings.'
          : event.error ===
              'language-not-supported'
            ? 'This recognition language is not installed on the phone. Try English mode.'
            : event.error === 'network'
              ? 'The phone speech-recognition service could not reach its network service.'
              : `Speech recognition error: ${event.message || event.error}`;

      setErrorMessage(readableError);
    }
  );

  const meterHeight = Math.max(
    6,
    Math.min(
      44,
      (volumeLevel + 2) * 4
    )
  );

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
            ? styles.studentRow
            : styles.tutorRow,
        ]}
      >
        {!isStudent && (
          <View style={styles.avatar}>
            <Ionicons
              name="sparkles"
              size={17}
              color="#071420"
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
            <View
              style={
                styles.messageHeader
              }
            >
              <Text
                style={styles.messageName}
              >
                SLICKK LIVE
              </Text>

              <Pressable
                onPress={() =>
                  void speakTutorReply(
                    item.text
                  )
                }
                style={({ pressed }) => [
                  styles.smallButton,
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
                styles.studentText,
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
        backgroundColor="#06101C"
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void stopLiveSession();
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
            <Text style={styles.headerTitle}>
              Live Tutor
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              {liveStateLabel(liveState)}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setRecognitionLanguage(
                (currentLanguage) =>
                  currentLanguage ===
                  'en-US'
                    ? 'bn-BD'
                    : 'en-US'
              );
            }}
            disabled={
              recognizing ||
              liveState === 'speaking' ||
              liveState === 'thinking'
            }
            style={({ pressed }) => [
              styles.languageButton,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={styles.languageText}
            >
              {recognitionLanguage ===
              'en-US'
                ? 'EN'
                : 'বাংলা'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.livePanel}>
          <View
            style={[
              styles.statusOrb,
              liveState === 'listening' &&
                styles.listeningOrb,
              liveState === 'hearing' &&
                styles.hearingOrb,
              liveState === 'thinking' &&
                styles.thinkingOrb,
              liveState === 'speaking' &&
                styles.speakingOrb,
              liveState === 'error' &&
                styles.errorOrb,
            ]}
          >
            {liveState === 'thinking' ? (
              <ActivityIndicator
                size="large"
                color="#06101C"
              />
            ) : (
              <Ionicons
                name={
                  liveState === 'speaking'
                    ? 'volume-high'
                    : liveState ===
                        'error'
                      ? 'warning'
                      : 'mic'
                }
                size={38}
                color="#06101C"
              />
            )}
          </View>

          <Text style={styles.liveTitle}>
            {liveStateLabel(liveState)}
          </Text>

          <Text style={styles.liveHelp}>
            {handsFree
              ? 'Hands-free mode is active. Slickk will listen again after every answer.'
              : 'Start a live session, then ask your question naturally.'}
          </Text>

          {(liveState === 'listening' ||
            liveState === 'hearing') && (
            <View style={styles.meterArea}>
              {[0.55, 0.8, 1, 0.72, 0.46].map(
                (factor, index) => (
                  <View
                    key={index}
                    style={[
                      styles.meterBar,
                      {
                        height: Math.max(
                          6,
                          meterHeight * factor
                        ),
                      },
                    ]}
                  />
                )
              )}
            </View>
          )}

          {interimTranscript ? (
            <View
              style={
                styles.transcriptCard
              }
            >
              <Text
                style={
                  styles.transcriptLabel
                }
              >
                YOU ARE SAYING
              </Text>

              <Text
                style={styles.transcript}
              >
                {interimTranscript}
              </Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <View style={styles.controlRow}>
            {!handsFree ? (
              <Pressable
                onPress={() =>
                  void startLiveSession()
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="mic"
                  size={22}
                  color="#06101C"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Start live session
                </Text>
              </Pressable>
            ) : liveState ===
              'speaking' ? (
              <Pressable
                onPress={() =>
                  void interruptTutor()
                }
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="hand-left"
                  size={22}
                  color="#06101C"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Interrupt and speak
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  if (recognizing) {
                    stopListening(true);
                  } else {
                    void startListening();
                  }
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={
                    recognizing
                      ? 'stop'
                      : 'mic'
                  }
                  size={22}
                  color="#06101C"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  {recognizing
                    ? 'Finish speaking'
                    : 'Listen now'}
                </Text>
              </Pressable>
            )}

            {handsFree && (
              <Pressable
                onPress={() =>
                  void stopLiveSession()
                }
                style={({ pressed }) => [
                  styles.stopButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="close"
                  size={23}
                  color="#FF8E8E"
                />
              </Pressable>
            )}
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
          onContentSizeChange={
            scrollToBottom
          }
          ListHeaderComponent={
            learningTwin ? (
              <View style={styles.twinCard}>
                <Text
                  style={styles.twinLabel}
                >
                  LEARNING TWIN
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
                    Confusion signal:{' '}
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
            ) : null
          }
        />

        <View style={styles.composer}>
          <View
            style={styles.inputContainer}
          >
            <TextInput
              value={typedInput}
              onChangeText={setTypedInput}
              placeholder="Type as a backup..."
              placeholderTextColor="#64748B"
              style={styles.input}
              editable={
                liveState !== 'thinking'
              }
              multiline
              maxLength={2000}
            />

            <Pressable
              onPress={() =>
                void submitTypedInput()
              }
              disabled={
                !typedInput.trim() ||
                liveState === 'thinking'
              }
              style={({ pressed }) => [
                styles.sendButton,
                (!typedInput.trim() ||
                  liveState ===
                    'thinking') &&
                  styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={21}
                color="#06101C"
              />
            </Pressable>
          </View>

          <Text style={styles.footerText}>
            Voice commands: repeat • slower •
            normal speed • stop
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06101C',
  },

  container: {
    flex: 1,
  },

  header: {
    minHeight:
      Platform.OS === 'android'
        ? 100
        : 72,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === 'android'
        ? 34
        : 8,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#15263A',
    backgroundColor: '#081522',
  },

  headerButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203249',
    backgroundColor: '#0D1C2B',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  headerSubtitle: {
    color: '#79DCC6',
    fontSize: 11,
    marginTop: 3,
  },

  languageButton: {
    minWidth: 48,
    height: 43,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#295244',
    backgroundColor: '#0D2B27',
  },

  languageText: {
    color: '#70F7D4',
    fontSize: 12,
    fontWeight: '900',
  },

  livePanel: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#14263A',
    backgroundColor: '#081522',
  },

  statusOrb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8190A4',
  },

  listeningOrb: {
    backgroundColor: '#70F7D4',
  },

  hearingOrb: {
    backgroundColor: '#5CE9FF',
  },

  thinkingOrb: {
    backgroundColor: '#FFD36E',
  },

  speakingOrb: {
    backgroundColor: '#A8F28B',
  },

  errorOrb: {
    backgroundColor: '#FF8E8E',
  },

  liveTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12,
  },

  liveHelp: {
    maxWidth: 330,
    color: '#8DA0B6',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },

  meterArea: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },

  meterBar: {
    width: 6,
    minHeight: 6,
    borderRadius: 4,
    backgroundColor: '#70F7D4',
  },

  transcriptCard: {
    width: '100%',
    marginTop: 12,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#28534B',
    backgroundColor: '#0B2926',
  },

  transcriptLabel: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  transcript: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },

  errorCard: {
    width: '100%',
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#71383D',
    backgroundColor: '#321B22',
  },

  errorText: {
    color: '#FFB3B3',
    fontSize: 12,
    lineHeight: 18,
  },

  controlRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 15,
  },

  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 20,
    borderRadius: 17,
    backgroundColor: '#70F7D4',
  },

  primaryButtonText: {
    color: '#06101C',
    fontSize: 13,
    fontWeight: '900',
  },

  stopButton: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5F313A',
    backgroundColor: '#281923',
  },

  messageList: {
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 20,
  },

  twinCard: {
    padding: 14,
    marginBottom: 18,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#245149',
    backgroundColor: '#0C2927',
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
    marginTop: 6,
  },

  twinDetail: {
    color: '#A5B7C4',
    fontSize: 12,
    marginTop: 5,
  },

  twinWarning: {
    color: '#FFD08A',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  twinNext: {
    color: '#91E5D2',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
  },

  tutorRow: {
    justifyContent: 'flex-start',
  },

  studentRow: {
    justifyContent: 'flex-end',
  },

  avatar: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#70F7D4',
  },

  messageBubble: {
    maxWidth: '83%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
  },

  tutorBubble: {
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: '#1B3045',
    backgroundColor: '#0D1C2B',
  },

  studentBubble: {
    borderBottomRightRadius: 5,
    backgroundColor: '#70F7D4',
  },

  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },

  messageName: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  smallButton: {
    width: 30,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  messageText: {
    color: '#E2EAF2',
    fontSize: 14,
    lineHeight: 21,
  },

  studentText: {
    color: '#06101C',
    fontWeight: '700',
  },

  composer: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom:
      Platform.OS === 'android'
        ? 17
        : 11,
    borderTopWidth: 1,
    borderTopColor: '#15263A',
    backgroundColor: '#081522',
  },

  inputContainer: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#203249',
    backgroundColor: '#0D1C2B',
  },

  input: {
    flex: 1,
    minHeight: 41,
    maxHeight: 100,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 9,
  },

  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#70F7D4',
  },

  disabledButton: {
    opacity: 0.35,
  },

  footerText: {
    color: '#586A80',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 7,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
});