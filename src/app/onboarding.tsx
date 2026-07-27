import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const LANGUAGES = ['English', 'বাংলা', 'Banglish'];
const GRADES = [
  'Grade 1–3',
  'Grade 4–6',
  'Grade 7–8',
  'Grade 9–10',
  'Grade 11–12',
  'University',
];

export default function OnboardingScreen() {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('English');
  const [grade, setGrade] = useState('Grade 7–8');

  const continueSetup = () => {
    router.push('/explore');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>

        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>

        <Text style={styles.step}>STEP 1 OF 3</Text>

        <Text style={styles.title}>
          Let Slickk learn about{' '}
          <Text style={styles.highlight}>you.</Text>
        </Text>

        <Text style={styles.subtitle}>
          Your tutor will adapt its explanations, questions and lesson speed to
          your profile.
        </Text>

        <View style={styles.section}>
          <Text style={styles.label}>WHAT SHOULD YOUR TUTOR CALL YOU?</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={21} color="#70F7D4" />

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
          <Text style={styles.label}>PREFERRED TEACHING LANGUAGE</Text>

          <View style={styles.optionGrid}>
            {LANGUAGES.map((item) => {
              const selected = language === item;

              return (
                <Pressable
                  key={item}
                  onPress={() => setLanguage(item)}
                  style={[
                    styles.languageOption,
                    selected && styles.optionSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {item}
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

        <View style={styles.section}>
          <Text style={styles.label}>CURRENT LEARNING LEVEL</Text>

          <View style={styles.gradeGrid}>
            {GRADES.map((item) => {
              const selected = grade === item;

              return (
                <Pressable
                  key={item}
                  onPress={() => setGrade(item)}
                  style={[
                    styles.gradeOption,
                    selected && styles.gradeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.gradeText,
                      selected && styles.gradeTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.intelligenceCard}>
          <View style={styles.intelligenceIcon}>
            <Ionicons name="sparkles" size={23} color="#70F7D4" />
          </View>

          <View style={styles.intelligenceText}>
            <Text style={styles.intelligenceTitle}>
              Your Learning Twin begins here
            </Text>

            <Text style={styles.intelligenceDescription}>
              Slickk will gradually understand your strengths, misconceptions,
              pace and preferred explanation style.
            </Text>
          </View>
        </View>

        <Pressable
          disabled={name.trim().length < 2}
          onPress={continueSetup}
          style={({ pressed }) => [
            styles.continueButton,
            name.trim().length < 2 && styles.continueButtonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.continueButtonText}>Continue setup</Text>
          <Ionicons name="arrow-forward" size={21} color="#081426" />
        </Pressable>

        <Text style={styles.privacyText}>
          Your profile stays private and can be changed later.
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
    width: '33%',
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
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: -1.3,
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
    marginTop: 32,
  },
  label: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  inputContainer: {
    height: 58,
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
  languageOption: {
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
  gradeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gradeOption: {
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  gradeSelected: {
    borderColor: '#70F7D4',
    backgroundColor: '#12312F',
  },
  gradeText: {
    color: '#A2AEC0',
    fontSize: 13,
    fontWeight: '700',
  },
  gradeTextSelected: {
    color: '#70F7D4',
  },
  intelligenceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 18,
    marginTop: 32,
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
  continueButton: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 21,
    marginTop: 28,
    borderRadius: 18,
    backgroundColor: '#70F7D4',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    color: '#081426',
    fontSize: 16,
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