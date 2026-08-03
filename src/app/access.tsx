import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  clearSlickkApiToken,
  hasSlickkApiToken,
  loadSlickkSession,
  saveSlickkApiToken,
  SlickkCredentialError,
  type SlickkSessionIdentity,
} from '@/services/api-auth';

type AccessState =
  | 'loading'
  | 'idle'
  | 'saving'
  | 'ready'
  | 'removing';

function accessErrorMessage(error: unknown) {
  if (error instanceof SlickkCredentialError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Slickk could not verify this access key.';
}

export default function ServerAccessScreen() {
  const insets = useSafeAreaInsets();

  const [token, setToken] = useState('');
  const [showToken, setShowToken] =
    useState(false);

  const [hasStoredToken, setHasStoredToken] =
    useState(false);

  const [session, setSession] =
    useState<SlickkSessionIdentity | null>(null);

  const [state, setState] =
    useState<AccessState>('loading');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isBusy =
    state === 'loading' ||
    state === 'saving' ||
    state === 'removing';

  useEffect(() => {
    let active = true;

    const loadAccessState = async () => {
      setState('loading');

      try {
        const stored =
          await hasSlickkApiToken();

        if (!active) {
          return;
        }

        setHasStoredToken(stored);

        if (!stored) {
          setSession(null);
          setState('idle');
          return;
        }

        const verifiedSession =
          await loadSlickkSession(true);

        if (!active) {
          return;
        }

        setSession(verifiedSession);
        setState('ready');
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          accessErrorMessage(loadError)
        );

        setState('idle');
      }
    };

    void loadAccessState();

    return () => {
      active = false;
    };
  }, []);

  const saveAndVerify = async () => {
    const normalizedToken = token.trim();

    setError('');
    setNotice('');

    if (normalizedToken.length < 24) {
      setError(
        'Enter the complete Slickk access key. It must contain at least 24 characters.'
      );
      return;
    }

    setState('saving');

    try {
      await saveSlickkApiToken(
        normalizedToken
      );

      const verifiedSession =
        await loadSlickkSession(true);

      if (
        verifiedSession.role !== 'student' &&
        verifiedSession.role !== 'local'
      ) {
        throw new SlickkCredentialError(
          'This key is not assigned to a student account.',
          'STUDENT_SESSION_REQUIRED'
        );
      }

      setToken('');
      setHasStoredToken(true);
      setSession(verifiedSession);

      setNotice(
        'Server access was verified and stored securely on this device.'
      );

      setState('ready');
    } catch (saveError) {
      await clearSlickkApiToken();

      setHasStoredToken(false);
      setSession(null);
      setError(
        accessErrorMessage(saveError)
      );
      setState('idle');
    }
  };

  const removeAccess = async () => {
    setError('');
    setNotice('');
    setState('removing');

    try {
      await clearSlickkApiToken();

      setToken('');
      setHasStoredToken(false);
      setSession(null);

      setNotice(
        'The saved server access key was removed from this device.'
      );
    } catch (removeError) {
      setError(
        accessErrorMessage(removeError)
      );
    } finally {
      setState('idle');
    }
  };

  const roleLabel =
    session?.role === 'student'
      ? 'Student account'
      : session?.role === 'local'
        ? 'Local development'
        : 'Not connected';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            {
              paddingBottom: Math.max(
                insets.bottom,
                24
              ),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topGlow} />

          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
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
              <Text style={styles.eyebrow}>
                SECURE CONNECTION
              </Text>

              <Text style={styles.title}>
                Slickk Server Access
              </Text>
            </View>
          </View>

          <Text style={styles.description}>
            Add the access key issued for this
            student. The key is stored in Android
            secure storage and is never included in
            the application source code.
          </Text>

          <View style={styles.statusCard}>
            <View
              style={[
                styles.statusIcon,
                hasStoredToken &&
                  session &&
                  styles.statusIconConnected,
              ]}
            >
              {state === 'loading' ? (
                <ActivityIndicator
                  size="small"
                  color="#70F7D4"
                />
              ) : (
                <Ionicons
                  name={
                    hasStoredToken && session
                      ? 'shield-checkmark'
                      : 'shield-outline'
                  }
                  size={25}
                  color={
                    hasStoredToken && session
                      ? '#081426'
                      : '#70F7D4'
                  }
                />
              )}
            </View>

            <View style={styles.statusCopy}>
              <Text style={styles.statusLabel}>
                {state === 'loading'
                  ? 'Checking secure storage'
                  : roleLabel}
              </Text>

              <Text
                style={styles.statusDescription}
              >
                {session
                  ? `Student ID: ${session.subjectId}`
                  : hasStoredToken
                    ? 'A saved key could not be verified.'
                    : 'No online access key is saved.'}
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>
              STUDENT ACCESS KEY
            </Text>

            <View style={styles.inputRow}>
              <Ionicons
                name="key-outline"
                size={21}
                color="#70F7D4"
              />

              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder={
                  hasStoredToken
                    ? 'Enter a replacement access key'
                    : 'Paste the student access key'
                }
                placeholderTextColor="#66738A"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                secureTextEntry={!showToken}
                editable={!isBusy}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showToken
                    ? 'Hide access key'
                    : 'Show access key'
                }
                disabled={isBusy}
                onPress={() =>
                  setShowToken(
                    (current) => !current
                  )
                }
                style={styles.visibilityButton}
              >
                <Ionicons
                  name={
                    showToken
                      ? 'eye-off-outline'
                      : 'eye-outline'
                  }
                  size={21}
                  color="#8A9AAF"
                />
              </Pressable>
            </View>

            <Text style={styles.fieldHint}>
              The key must match the student account
              configured on the Slickk server.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color="#FF8B8B"
              />

              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          {notice ? (
            <View style={styles.noticeCard}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#70F7D4"
              />

              <Text style={styles.noticeText}>
                {notice}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={
              isBusy ||
              token.trim().length < 24
            }
            onPress={() =>
              void saveAndVerify()
            }
            style={({ pressed }) => [
              styles.saveButton,
              (isBusy ||
                token.trim().length < 24) &&
                styles.disabledButton,
              pressed &&
                !isBusy &&
                styles.buttonPressed,
            ]}
          >
            <Text style={styles.saveButtonText}>
              {state === 'saving'
                ? 'Verifying access key?'
                : hasStoredToken
                  ? 'Replace and verify key'
                  : 'Save and verify key'}
            </Text>

            {state === 'saving' ? (
              <ActivityIndicator
                size="small"
                color="#081426"
              />
            ) : (
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color="#081426"
              />
            )}
          </Pressable>

          {hasStoredToken ? (
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() =>
                void removeAccess()
              }
              style={({ pressed }) => [
                styles.removeButton,
                pressed && styles.pressed,
              ]}
            >
              {state === 'removing' ? (
                <ActivityIndicator
                  size="small"
                  color="#FF9E9E"
                />
              ) : (
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color="#FF9E9E"
                />
              )}

              <Text
                style={styles.removeButtonText}
              >
                Remove saved access key
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.securityNote}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color="#70F7D4"
            />

            <Text style={styles.securityText}>
              A saved key is never displayed again.
              Verification confirms the server-bound
              student identity without exposing the
              credential.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === 'android' ? 12 : 18,
    overflow: 'hidden',
  },

  topGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -160,
    right: -120,
    backgroundColor:
      'rgba(112, 247, 212, 0.08)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },

  backButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1A2C',
    borderWidth: 1,
    borderColor: '#20324A',
  },

  headerCopy: {
    flex: 1,
  },

  eyebrow: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },

  title: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
  },

  description: {
    marginTop: 24,
    color: '#91A1B6',
    fontSize: 14,
    lineHeight: 22,
  },

  statusCard: {
    marginTop: 24,
    padding: 17,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1C3048',
  },

  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102237',
    borderWidth: 1,
    borderColor: '#24506A',
  },

  statusIconConnected: {
    backgroundColor: '#70F7D4',
    borderColor: '#70F7D4',
  },

  statusCopy: {
    flex: 1,
  },

  statusLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  statusDescription: {
    marginTop: 4,
    color: '#8293A8',
    fontSize: 12,
    lineHeight: 18,
  },

  formCard: {
    marginTop: 18,
    padding: 17,
    borderRadius: 22,
    backgroundColor: '#0C192A',
    borderWidth: 1,
    borderColor: '#1C3048',
  },

  fieldLabel: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },

  inputRow: {
    minHeight: 58,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#091525',
    borderWidth: 1,
    borderColor: '#22364E',
  },

  input: {
    flex: 1,
    minHeight: 54,
    color: '#FFFFFF',
    fontSize: 14,
  },

  visibilityButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fieldHint: {
    marginTop: 10,
    color: '#687B92',
    fontSize: 11,
    lineHeight: 17,
  },

  errorCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#2A171C',
    borderWidth: 1,
    borderColor: '#5D2934',
  },

  errorText: {
    flex: 1,
    color: '#FFB0B0',
    fontSize: 12,
    lineHeight: 18,
  },

  noticeCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#10251F',
    borderWidth: 1,
    borderColor: '#24584A',
  },

  noticeText: {
    flex: 1,
    color: '#B8FCEB',
    fontSize: 12,
    lineHeight: 18,
  },

  saveButton: {
    minHeight: 58,
    marginTop: 20,
    paddingHorizontal: 20,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#70F7D4',
  },

  saveButtonText: {
    flex: 1,
    color: '#081426',
    fontSize: 15,
    fontWeight: '900',
  },

  disabledButton: {
    opacity: 0.4,
  },

  removeButton: {
    minHeight: 52,
    marginTop: 13,
    paddingHorizontal: 18,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#20151A',
    borderWidth: 1,
    borderColor: '#4B2731',
  },

  removeButtonText: {
    color: '#FFB0B0',
    fontSize: 13,
    fontWeight: '800',
  },

  securityNote: {
    marginTop: 22,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  securityText: {
    flex: 1,
    color: '#65788F',
    fontSize: 11,
    lineHeight: 17,
  },

  pressed: {
    opacity: 0.72,
  },

  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
});
