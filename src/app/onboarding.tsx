import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  loadProfileOptions,
  loadStudentProfile,
  ProfileOptions,
  saveStudentProfile,
  School,
  searchSchools,
} from '@/services/student-profile';

const DEFAULT_SUBJECTS = [
  'Mathematics',
  'English',
  'Bangla',
  'Science',
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const [options, setOptions] =
    useState<ProfileOptions | null>(null);
  const [name, setName] = useState('');
  const [language, setLanguage] =
    useState('english');
  const [curriculumTrack, setCurriculumTrack] =
    useState('nctb-english-version');
  const [grade, setGrade] = useState('Class 7');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolResults, setSchoolResults] = useState<
    School[]
  >([]);
  const [selectedSchool, setSelectedSchool] =
    useState<School | null>(null);
  const [schoolEntryMode, setSchoolEntryMode] = useState<
    'directory' | 'other'
  >('directory');
  const [subjects, setSubjects] =
    useState<string[]>(DEFAULT_SUBJECTS);
  const [isSearching, setIsSearching] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([
      loadProfileOptions(),
      loadStudentProfile().catch(() => null),
    ]).then(([loadedOptions, profile]) => {
      if (!active) {
        return;
      }

      setOptions(loadedOptions);

      if (profile) {
        setName(profile.studentName);
        setLanguage(profile.teachingLanguage);
        setCurriculumTrack(profile.curriculumTrack);
        setGrade(profile.grade);
        setSelectedSchool(profile.school);
        setSchoolQuery(profile.school.name);
        setSchoolEntryMode(
          profile.school.custom ? 'other' : 'directory'
        );
        setSubjects(profile.subjects);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      step !== 3 ||
      schoolEntryMode !== 'directory' ||
      schoolQuery.trim().length < 2 ||
      selectedSchool?.name === schoolQuery.trim()
    ) {
      setSchoolResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);

      try {
        const results = await searchSchools(
          schoolQuery,
          controller.signal
        );
        setSchoolResults(results);
      } catch {
        if (!controller.signal.aborted) {
          setSchoolResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    schoolEntryMode,
    schoolQuery,
    selectedSchool?.name,
    step,
  ]);

  const currentTrack = useMemo(
    () =>
      options?.curriculumTracks.find(
        (track) => track.id === curriculumTrack
      ),
    [curriculumTrack, options]
  );

  const canContinue =
    step === 1
      ? name.trim().length >= 2
      : step === 2
        ? Boolean(curriculumTrack && grade)
        : subjects.length > 0 &&
          (schoolEntryMode === 'directory'
            ? Boolean(selectedSchool)
            : schoolQuery.trim().length >= 2);

  const goBack = () => {
    setError('');

    if (step === 1) {
      router.back();
      return;
    }

    setStep((value) => value - 1);
  };

  const continueSetup = async () => {
    setError('');

    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }

    const school: School =
      schoolEntryMode === 'directory' &&
      selectedSchool?.name === schoolQuery.trim()
        ? selectedSchool
        : {
            id: `custom-${Date.now()}`,
            name: schoolQuery.trim(),
            eiin: '',
            district: '',
            upazila: '',
            custom: true,
          };

    setIsSaving(true);

    try {
      await saveStudentProfile({
        studentName: name.trim(),
        teachingLanguage: language,
        curriculumTrack,
        grade,
        school,
        subjects,
        setupComplete: true,
      });
      router.replace('/explore');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Slickk could not save this profile.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSubject = (subject: string) => {
    setSubjects((current) =>
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject]
    );
  };

  if (!options) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
            color="#70F7D4"
          />
          <Text style={styles.loadingText}>
            Preparing your learning profile…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={goBack}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#FFFFFF"
          />
        </Pressable>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${step * 33.333}%` },
            ]}
          />
        </View>

        <Text style={styles.step}>
          STEP {step} OF 3
        </Text>

        {step === 1 && (
          <>
            <Text style={styles.title}>
              Let Slickk learn about{' '}
              <Text style={styles.highlight}>you.</Text>
            </Text>
            <Text style={styles.subtitle}>
              Your LLM tutor will remember your level,
              language, school curriculum and learning
              progress.
            </Text>

            <View style={styles.section}>
              <Text style={styles.label}>
                WHAT SHOULD YOUR TUTOR CALL YOU?
              </Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={21}
                  color="#70F7D4"
                />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor="#66738A"
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>
                PREFERRED TEACHING LANGUAGE
              </Text>
              <View style={styles.optionGrid}>
                {options.teachingLanguages.map((item) => {
                  const selected = language === item.id;

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setLanguage(item.id)}
                      style={[
                        styles.fullOption,
                        selected && styles.optionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selected &&
                            styles.optionTextSelected,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={19}
                          color="#081426"
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>
              Choose your{' '}
              <Text style={styles.highlight}>
                curriculum.
              </Text>
            </Text>
            <Text style={styles.subtitle}>
              Slickk will keep the LLM tutor, then constrain
              its lessons and book retrieval to this exact
              track and class.
            </Text>

            <View style={styles.section}>
              <Text style={styles.label}>
                SCHOOL CURRICULUM
              </Text>
              <View style={styles.optionGrid}>
                {options.curriculumTracks.map((track) => {
                  const selected =
                    curriculumTrack === track.id;

                  return (
                    <Pressable
                      key={track.id}
                      onPress={() =>
                        setCurriculumTrack(track.id)
                      }
                      style={[
                        styles.trackOption,
                        selected && styles.trackSelected,
                      ]}
                    >
                      <View style={styles.trackCopy}>
                        <Text
                          style={[
                            styles.trackTitle,
                            selected &&
                              styles.trackTitleSelected,
                          ]}
                        >
                          {track.name}
                        </Text>
                        <Text style={styles.trackAccess}>
                          {track.resourceAccess ===
                          'official-public'
                            ? 'Official public textbooks'
                            : 'Official syllabus + licensed books'}
                        </Text>
                      </View>
                      <Ionicons
                        name={
                          selected
                            ? 'radio-button-on'
                            : 'radio-button-off'
                        }
                        size={21}
                        color={
                          selected ? '#70F7D4' : '#526278'
                        }
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>
                CURRENT CLASS
              </Text>
              <View style={styles.chipGrid}>
                {options.grades.map((item) => {
                  const selected = grade === item.name;

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setGrade(item.name)}
                      style={[
                        styles.chip,
                        selected && styles.chipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected &&
                            styles.chipTextSelected,
                        ]}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {currentTrack?.resourceAccess !==
              'official-public' && (
              <View style={styles.noticeCard}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={22}
                  color="#F5C76B"
                />
                <Text style={styles.noticeText}>
                  Commercial English-medium textbooks are
                  added only from a school or family’s
                  licensed copy. Slickk can still follow the
                  official public syllabus.
                </Text>
              </View>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>
              Connect your{' '}
              <Text style={styles.highlight}>school.</Text>
            </Text>
            <Text style={styles.subtitle}>
              Choose your school from Bangladesh’s verified
              directory. If it is missing, choose Other.
            </Text>

            <View style={styles.section}>
              <Text style={styles.label}>
                {schoolEntryMode === 'directory'
                  ? 'SEARCH SCHOOL DIRECTORY'
                  : 'OTHER SCHOOL NAME'}
              </Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="school-outline"
                  size={21}
                  color="#70F7D4"
                />
                <TextInput
                  value={schoolQuery}
                  onChangeText={(value) => {
                    setSchoolQuery(value);
                    setSelectedSchool(null);
                  }}
                  placeholder={
                    schoolEntryMode === 'directory'
                      ? 'Search by school name or EIIN'
                      : 'Enter your school’s official name'
                  }
                  placeholderTextColor="#66738A"
                  style={styles.input}
                  autoCapitalize="words"
                />
                {isSearching && (
                  <ActivityIndicator
                    size="small"
                    color="#70F7D4"
                  />
                )}
              </View>

              {schoolEntryMode === 'directory' &&
                schoolResults.length > 0 && (
                <View style={styles.schoolResults}>
                  {schoolResults.map((school) => (
                    <Pressable
                      key={school.id || school.eiin}
                      onPress={() => {
                        setSelectedSchool(school);
                        setSchoolQuery(school.name);
                        setSchoolResults([]);
                      }}
                      style={styles.schoolResult}
                    >
                      <View style={styles.schoolCopy}>
                        <Text style={styles.schoolName}>
                          {school.name}
                        </Text>
                        <Text style={styles.schoolMeta}>
                          {[
                            school.eiin
                              ? `EIIN ${school.eiin}`
                              : '',
                            school.upazila,
                            school.district,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </Text>
                      </View>
                      <Ionicons
                        name="add-circle-outline"
                        size={21}
                        color="#70F7D4"
                      />
                    </Pressable>
                  ))}
                </View>
              )}

              {schoolEntryMode === 'directory' &&
                schoolQuery.trim().length >= 2 &&
                !selectedSchool &&
                !isSearching && (
                  <Text style={styles.manualHint}>
                    Select a result above. If your school is
                    absent, choose Other below.
                  </Text>
                )}

              <Pressable
                onPress={() => {
                  setSchoolEntryMode((current) =>
                    current === 'directory'
                      ? 'other'
                      : 'directory'
                  );
                  setSchoolQuery('');
                  setSelectedSchool(null);
                  setSchoolResults([]);
                }}
                style={styles.otherSchoolButton}
              >
                <Ionicons
                  name={
                    schoolEntryMode === 'directory'
                      ? 'add-circle-outline'
                      : 'search-outline'
                  }
                  size={20}
                  color="#70F7D4"
                />
                <Text style={styles.otherSchoolText}>
                  {schoolEntryMode === 'directory'
                    ? 'Other / My school is not listed'
                    : 'Back to verified school directory'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>
                SUBJECTS YOU STUDY
              </Text>
              <View style={styles.subjectList}>
                {options.subjects.map((subject) => {
                  const selected = subjects.includes(subject);

                  return (
                    <Pressable
                      key={subject}
                      onPress={() => toggleSubject(subject)}
                      style={[
                        styles.subjectOption,
                        selected &&
                          styles.subjectSelected,
                      ]}
                    >
                      <Ionicons
                        name={
                          selected
                            ? 'checkmark-circle'
                            : 'ellipse-outline'
                        }
                        size={20}
                        color={
                          selected ? '#70F7D4' : '#53647A'
                        }
                      />
                      <Text
                        style={[
                          styles.subjectText,
                          selected &&
                            styles.subjectTextSelected,
                        ]}
                      >
                        {subject}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        <View style={styles.intelligenceCard}>
          <View style={styles.intelligenceIcon}>
            <Ionicons
              name="sparkles"
              size={23}
              color="#70F7D4"
            />
          </View>
          <View style={styles.intelligenceText}>
            <Text style={styles.intelligenceTitle}>
              Your Learning Twin begins here
            </Text>
            <Text style={styles.intelligenceDescription}>
              The LLM remains your tutor. This profile tells
              it which curriculum, class, books, language and
              teaching level belong to you.
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color="#FF8B8B"
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={!canContinue || isSaving}
          onPress={continueSetup}
          style={({ pressed }) => [
            styles.continueButton,
            (!canContinue || isSaving) &&
              styles.continueButtonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.continueButtonText}>
            {step === 3
              ? isSaving
                ? 'Saving profile…'
                : 'Start personalized learning'
              : 'Continue setup'}
          </Text>
          {isSaving ? (
            <ActivityIndicator
              size="small"
              color="#081426"
            />
          ) : (
            <Ionicons
              name="arrow-forward"
              size={21}
              color="#081426"
            />
          )}
        </Pressable>

        <Text style={styles.privacyText}>
          Your local profile stays private and can be changed
          later.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07101E',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 36,
    backgroundColor: '#07101E',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    color: '#91A0B6',
    fontSize: 14,
  },
  backButton: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  progressTrack: {
    height: 5,
    marginTop: 28,
    borderRadius: 10,
    backgroundColor: '#172337',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#70F7D4',
  },
  step: {
    color: '#70F7D4',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 37,
    lineHeight: 43,
    fontWeight: '900',
    letterSpacing: -1.2,
    marginTop: 12,
  },
  highlight: {
    color: '#70F7D4',
  },
  subtitle: {
    color: '#91A0B6',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
  },
  section: {
    marginTop: 30,
  },
  label: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  inputContainer: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  optionGrid: {
    gap: 10,
  },
  fullOption: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 17,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  optionSelected: {
    borderColor: '#70F7D4',
    backgroundColor: '#70F7D4',
  },
  optionText: {
    color: '#D5DCE7',
    fontSize: 15,
    fontWeight: '700',
  },
  optionTextSelected: {
    color: '#081426',
    fontWeight: '900',
  },
  trackOption: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  trackSelected: {
    borderColor: '#70F7D4',
    backgroundColor: '#0D292D',
  },
  trackCopy: {
    flex: 1,
  },
  trackTitle: {
    color: '#DCE4EF',
    fontSize: 15,
    fontWeight: '800',
  },
  trackTitleSelected: {
    color: '#70F7D4',
  },
  trackAccess: {
    color: '#718096',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  chipSelected: {
    borderColor: '#70F7D4',
    backgroundColor: '#12312F',
  },
  chipText: {
    color: '#A2AEC0',
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: '#70F7D4',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 22,
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#493D24',
    backgroundColor: '#211D15',
  },
  noticeText: {
    flex: 1,
    color: '#CFC3A7',
    fontSize: 12,
    lineHeight: 19,
  },
  schoolResults: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
    overflow: 'hidden',
  },
  schoolResult: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#203047',
  },
  schoolCopy: {
    flex: 1,
  },
  schoolName: {
    color: '#E7EDF5',
    fontSize: 14,
    fontWeight: '800',
  },
  schoolMeta: {
    color: '#738198',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  manualHint: {
    color: '#7F8DA1',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  otherSchoolButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#28534F',
    backgroundColor: '#0C2429',
  },
  otherSchoolText: {
    color: '#CFF9EE',
    fontSize: 13,
    fontWeight: '800',
  },
  subjectList: {
    gap: 9,
  },
  subjectOption: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#1C2A3F',
    backgroundColor: '#0B1626',
  },
  subjectSelected: {
    borderColor: '#28534F',
    backgroundColor: '#0C2429',
  },
  subjectText: {
    flex: 1,
    color: '#8F9AAF',
    fontSize: 13,
    fontWeight: '700',
  },
  subjectTextSelected: {
    color: '#CFF9EE',
  },
  intelligenceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 18,
    marginTop: 30,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1D3941',
    backgroundColor: '#0A2028',
  },
  intelligenceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#103139',
  },
  intelligenceText: {
    flex: 1,
  },
  intelligenceTitle: {
    color: '#EAFDF8',
    fontSize: 15,
    fontWeight: '900',
  },
  intelligenceDescription: {
    color: '#86A3A5',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginTop: 18,
    borderRadius: 15,
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
  continueButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 21,
    marginTop: 26,
    borderRadius: 18,
    backgroundColor: '#70F7D4',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    flex: 1,
    color: '#081426',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  privacyText: {
    color: '#59677C',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
  },
});
