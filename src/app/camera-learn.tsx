import { Ionicons } from '@expo/vector-icons';
import type {
  CameraView as CameraViewType,
  FlashMode,
} from 'expo-camera';
import { Image } from 'expo-image';
import {
  router,
  useLocalSearchParams,
} from 'expo-router';
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  addCameraMaterial,
  analyzeLearningMaterials,
  clearLearningMaterials,
  LearningMaterialError,
  loadLearningMaterials,
  pickLearningMaterials,
  removeLearningMaterial,
  type LearningMaterial,
  type MaterialAnalysisResult,
} from '@/services/learning-materials';

type CaptureMode = 'library' | 'camera';

type ExpoCameraModule = typeof import('expo-camera');

let expoCamera: ExpoCameraModule | null = null;

try {
  expoCamera = require('expo-camera') as ExpoCameraModule;
} catch {
  // Keep the rest of the app usable when an older native client is installed.
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown) {
  if (error instanceof LearningMaterialError) {
    return error.message;
  }

  return 'Slickk could not prepare that learning material.';
}

export default function CameraLearnScreen() {
  if (!expoCamera) {
    return <CameraUnavailableScreen />;
  }

  return <CameraLearnScreenWithCamera camera={expoCamera} />;
}

function CameraUnavailableScreen() {
  return (
    <SafeAreaView style={styles.permissionScreen}>
      <View style={styles.permissionCard}>
        <View style={styles.permissionIcon}>
          <Ionicons
            name="camera-outline"
            size={31}
            color="#70F7D4"
          />
        </View>
        <Text style={styles.permissionTitle}>
          Camera update required
        </Text>
        <Text style={styles.permissionText}>
          This installed Slickk build does not include the
          camera module yet. Install the corrected development
          build, then reopen the app.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            Go back
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CameraLearnScreenWithCamera({
  camera,
}: {
  camera: ExpoCameraModule;
}) {
  const { CameraView, useCameraPermissions } = camera;
  const { mode: requestedMode } = useLocalSearchParams<{
    mode?: string;
  }>();
  const [mode, setMode] = useState<CaptureMode>(
    requestedMode === 'camera' ? 'camera' : 'library'
  );
  const [materials, setMaterials] = useState<
    LearningMaterial[]
  >([]);
  const [analysisResults, setAnalysisResults] = useState<
    MaterialAnalysisResult[]
  >([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isCameraReady, setIsCameraReady] =
    useState(false);
  const [flash, setFlash] =
    useState<FlashMode>('off');
  const [error, setError] = useState('');
  const [permission, requestPermission] =
    useCameraPermissions();
  const cameraRef = useRef<CameraViewType>(null);
  const cameraPermissionRequested = useRef(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;

    loadLearningMaterials()
      .then((loaded) => {
        if (active) {
          setMaterials(loaded);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(errorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      mode === 'camera' &&
      !permission?.granted &&
      permission?.canAskAgain &&
      !cameraPermissionRequested.current
    ) {
      cameraPermissionRequested.current = true;
      void requestPermission();
    }
  }, [
    mode,
    permission?.canAskAgain,
    permission?.granted,
    requestPermission,
  ]);

  const openFiles = async () => {
    setError('');
    setIsBusy(true);

    try {
      setMaterials(await pickLearningMaterials());
    } catch (pickError) {
      setError(errorMessage(pickError));
    } finally {
      setIsBusy(false);
    }
  };

  const takePhoto = async () => {
    if (
      !cameraRef.current ||
      !isCameraReady ||
      isBusy
    ) {
      return;
    }

    setError('');
    setIsBusy(true);

    try {
      const photo =
        await cameraRef.current.takePictureAsync({
          quality: 0.86,
        });
      const next = await addCameraMaterial(photo);
      setMaterials(next);
      setMode('library');
    } catch (captureError) {
      setError(errorMessage(captureError));
    } finally {
      setIsBusy(false);
    }
  };

  const removeMaterial = async (
    material: LearningMaterial
  ) => {
    setError('');

    try {
      setMaterials(
        await removeLearningMaterial(material.id)
      );
    } catch (removeError) {
      setError(errorMessage(removeError));
    }
  };

  const confirmClear = () => {
    Alert.alert(
      'Remove temporary materials?',
      'This removes every prepared photo and file from Slickk’s private cache.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove all',
          style: 'destructive',
          onPress: () => {
            void clearLearningMaterials()
              .then(setMaterials)
              .catch((clearError) => {
                setError(errorMessage(clearError));
              });
          },
        },
      ]
    );
  };

  const analyzeMaterials = async () => {
    if (materials.length === 0 || isBusy) {
      return;
    }

    setError('');
    setAnalysisResults([]);
    setIsBusy(true);

    try {
      setAnalysisResults(
        await analyzeLearningMaterials(materials)
      );
    } catch (analysisError) {
      setError(errorMessage(analysisError));
    } finally {
      setIsBusy(false);
    }
  };

  if (mode === 'camera') {
    if (!permission) {
      return (
        <View style={styles.cameraLoading}>
          <ActivityIndicator
            size="large"
            color="#70F7D4"
          />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <SafeAreaView style={styles.permissionScreen}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionIcon}>
              <Ionicons
                name="camera-outline"
                size={31}
                color="#70F7D4"
              />
            </View>
            <Text style={styles.permissionTitle}>
              Camera access is needed
            </Text>
            <Text style={styles.permissionText}>
              Slickk uses the camera only when you choose
              to photograph a worksheet, diagram, or page.
            </Text>
            <Pressable
              onPress={() => void requestPermission()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                Allow camera
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('library')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                Choose a file instead
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <View style={styles.cameraScreen}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#000000"
        />
        <CameraView
          ref={cameraRef}
          facing="back"
          flash={flash}
          mode="picture"
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={(event) =>
            setError(event.message)
          }
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.cameraTopBar,
            { paddingTop: insets.top + 10 },
          ]}
        >
          <Pressable
            accessibilityLabel="Close camera"
            onPress={() => setMode('library')}
            style={styles.cameraRoundButton}
          >
            <Ionicons
              name="close"
              size={25}
              color="#FFFFFF"
            />
          </Pressable>

          <View style={styles.cameraInstruction}>
            <Text style={styles.cameraInstructionTitle}>
              Keep the page inside the frame
            </Text>
            <Text style={styles.cameraInstructionText}>
              Use clear light and avoid shadows
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Toggle camera flash"
            onPress={() =>
              setFlash((current) =>
                current === 'off' ? 'on' : 'off'
              )
            }
            style={styles.cameraRoundButton}
          >
            <Ionicons
              name={
                flash === 'on'
                  ? 'flash'
                  : 'flash-off'
              }
              size={22}
              color="#FFFFFF"
            />
          </Pressable>
        </View>

        <View style={styles.documentFrame} />

        <View
          style={[
            styles.cameraBottomBar,
            { paddingBottom: insets.bottom + 18 },
          ]}
        >
          {error ? (
            <Text style={styles.cameraError}>{error}</Text>
          ) : null}
          <Pressable
            accessibilityLabel="Take learning material photo"
            disabled={!isCameraReady || isBusy}
            onPress={() => void takePhoto()}
            style={[
              styles.shutterOuter,
              (!isCameraReady || isBusy) &&
                styles.disabled,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator color="#081426" />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#07101E"
      />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#FFFFFF"
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PHASE 17</Text>
          <Text style={styles.title}>
            Learning materials
          </Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Photograph a worksheet or choose a document.
        Slickk keeps a private temporary copy ready for
        OCR and lesson grounding.
      </Text>

      <View style={styles.actionGrid}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Photograph learning material"
          onPress={() => setMode('camera')}
          style={({ pressed }) => [
            styles.actionCard,
            styles.cameraActionCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.actionIcon}>
            <Ionicons
              name="camera"
              size={28}
              color="#081426"
            />
          </View>
          <Text style={styles.actionTitleDark}>
            Take a photo
          </Text>
          <Text style={styles.actionTextDark}>
            Worksheets, book pages, diagrams, and
            handwriting
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose learning files"
          disabled={isBusy}
          onPress={() => void openFiles()}
          style={({ pressed }) => [
            styles.actionCard,
            styles.fileActionCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.fileActionIcon}>
            {isBusy ? (
              <ActivityIndicator color="#70F7D4" />
            ) : (
              <Ionicons
                name="document-text-outline"
                size={27}
                color="#70F7D4"
              />
            )}
          </View>
          <Text style={styles.actionTitle}>
            Choose files
          </Text>
          <Text style={styles.actionText}>
            Images, PDF, and text documents
          </Text>
        </Pressable>
      </View>

      <View style={styles.privacyCard}>
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color="#70F7D4"
        />
        <Text style={styles.privacyText}>
          Materials stay in Slickk’s private workspace
          and are sent only to your connected local Slickk
          LLM server. They are never added to your photo
          library.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons
            name="alert-circle-outline"
            size={21}
            color="#FF9A9A"
          />
          <Text selectable style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>
            READY FOR ANALYSIS
          </Text>
          <Text style={styles.sectionTitle}>
            Temporary materials
          </Text>
        </View>
        {materials.length > 0 ? (
          <Pressable onPress={confirmClear}>
            <Text style={styles.clearText}>
              Remove all
            </Text>
          </Pressable>
        ) : null}
      </View>

      {materials.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="images-outline"
              size={29}
              color="#70849A"
            />
          </View>
          <Text style={styles.emptyTitle}>
            Nothing prepared yet
          </Text>
          <Text style={styles.emptyText}>
            Add a clear page or document. OCR and visual
            understanding will connect in the next phase.
          </Text>
        </View>
      ) : (
        <View style={styles.materialList}>
          {materials.map((material) => (
            <View
              key={material.id}
              style={styles.materialCard}
            >
              {material.mimeType.startsWith('image/') ? (
                <Image
                  contentFit="cover"
                  source={{ uri: material.uri }}
                  style={styles.materialPreview}
                />
              ) : (
                <View style={styles.documentPreview}>
                  <Ionicons
                    name="document-text"
                    size={27}
                    color="#70F7D4"
                  />
                </View>
              )}

              <View style={styles.materialCopy}>
                <Text
                  numberOfLines={1}
                  style={styles.materialName}
                >
                  {material.name}
                </Text>
                <Text style={styles.materialMeta}>
                  {material.source === 'camera'
                    ? 'Camera'
                    : 'File'}{' '}
                  · {formatBytes(material.size)}
                </Text>
              </View>

              <Pressable
                accessibilityLabel={`Remove ${material.name}`}
                onPress={() =>
                  void removeMaterial(material)
                }
                style={styles.removeButton}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color="#FF9A9A"
                />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {materials.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => void analyzeMaterials()}
          style={[
            styles.analyzeButton,
            isBusy && styles.disabled,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color="#081426" />
          ) : (
            <Ionicons
              name="scan"
              size={22}
              color="#081426"
            />
          )}
          <Text style={styles.analyzeButtonText}>
            {isBusy
              ? 'Analyzing locally...'
              : `Analyze ${materials.length} ${
                  materials.length === 1
                    ? 'material'
                    : 'materials'
                }`}
          </Text>
        </Pressable>
      ) : null}

      {analysisResults.length > 0 ? (
        <View style={styles.analysisCard}>
          <View style={styles.analysisHeader}>
            <Ionicons
              name="checkmark-circle"
              size={24}
              color="#70F7D4"
            />
            <Text style={styles.analysisTitle}>
              Analysis ready
            </Text>
          </View>
          {analysisResults.map((result) => (
            <View
              key={result.materialId}
              style={styles.analysisResult}
            >
              <Text style={styles.analysisName}>
                {result.name}
              </Text>
              <Text style={styles.analysisMeta}>
                {result.pageCount}{' '}
                {result.pageCount === 1 ? 'page' : 'pages'}
                {' · '}
                {result.ocrPageCount > 0
                  ? `${result.ocrPageCount} OCR`
                  : 'text extracted'}
              </Text>
              {result.previewText ? (
                <Text
                  numberOfLines={4}
                  style={styles.analysisPreview}
                >
                  {result.previewText}
                </Text>
              ) : null}
            </View>
          ))}
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/tutor',
                params: {
                  prompt:
                    'Teach me from the learning material I just analyzed.',
                },
              })
            }
            style={styles.lessonButton}
          >
            <Text style={styles.lessonButtonText}>
              Start grounded lesson
            </Text>
            <Ionicons
              name="arrow-forward"
              size={20}
              color="#70F7D4"
            />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.nextPhaseCard}>
        <View style={styles.nextPhaseIcon}>
          <Ionicons
            name="scan-outline"
            size={24}
            color="#70F7D4"
          />
        </View>
        <View style={styles.nextPhaseCopy}>
          <Text style={styles.nextPhaseLabel}>
            NEXT: OCR + VISION
          </Text>
          <Text style={styles.nextPhaseText}>
            Extract text, equations, handwriting, and
            diagrams before starting a grounded lesson.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#07101E',
  },
  container: {
    flexGrow: 1,
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 44,
    backgroundColor: '#07101E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#203047',
    backgroundColor: '#0C1828',
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#70F7D4',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 3,
  },
  subtitle: {
    color: '#91A0B6',
    fontSize: 14,
    lineHeight: 22,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    minHeight: 176,
    padding: 17,
    borderRadius: 23,
  },
  cameraActionCard: {
    backgroundColor: '#70F7D4',
  },
  fileActionCard: {
    borderWidth: 1,
    borderColor: '#1D3549',
    backgroundColor: '#0A1A2B',
  },
  actionIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(8, 20, 38, 0.12)',
  },
  fileActionIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#102B31',
  },
  actionTitle: {
    color: '#F4F8FC',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 17,
  },
  actionTitleDark: {
    color: '#081426',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 17,
  },
  actionText: {
    color: '#7F90A6',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  actionTextDark: {
    color: '#315B58',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1A3940',
    backgroundColor: '#092229',
  },
  privacyText: {
    flex: 1,
    color: '#8BA5A7',
    fontSize: 12,
    lineHeight: 19,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#5D2934',
    backgroundColor: '#2A171C',
  },
  errorText: {
    flex: 1,
    color: '#FFC0C0',
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionEyebrow: {
    color: '#62768D',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: '#F3F7FC',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  clearText: {
    color: '#FF9A9A',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 27,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#1A2B40',
    backgroundColor: '#0A1727',
  },
  emptyIcon: {
    width: 55,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#101F31',
  },
  emptyTitle: {
    color: '#E9EFF6',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyText: {
    maxWidth: 300,
    color: '#74869C',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  materialList: {
    gap: 10,
  },
  materialCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 10,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#1A2D42',
    backgroundColor: '#0A1727',
  },
  materialPreview: {
    width: 56,
    height: 56,
    borderRadius: 13,
    backgroundColor: '#132238',
  },
  documentPreview: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#102B31',
  },
  materialCopy: {
    flex: 1,
  },
  materialName: {
    color: '#E9EFF6',
    fontSize: 13,
    fontWeight: '800',
  },
  materialMeta: {
    color: '#71849A',
    fontSize: 11,
    marginTop: 5,
  },
  analyzeButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#70F7D4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  analyzeButtonText: {
    color: '#081426',
    fontSize: 16,
    fontWeight: '900',
  },
  analysisCard: {
    gap: 13,
    borderWidth: 1,
    borderColor: '#28574F',
    borderRadius: 22,
    backgroundColor: '#0B2428',
    padding: 18,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  analysisTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  analysisResult: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#204047',
    paddingTop: 12,
  },
  analysisName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  analysisMeta: {
    color: '#70F7D4',
    fontSize: 12,
    fontWeight: '700',
  },
  analysisPreview: {
    color: '#AAB8C8',
    fontSize: 13,
    lineHeight: 19,
  },
  lessonButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3B756C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  lessonButtonText: {
    color: '#70F7D4',
    fontSize: 14,
    fontWeight: '900',
  },
  removeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#281A21',
  },
  nextPhaseCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 17,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#203248',
    backgroundColor: '#0B1828',
  },
  nextPhaseIcon: {
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#102B31',
  },
  nextPhaseCopy: {
    flex: 1,
  },
  nextPhaseLabel: {
    color: '#70F7D4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  nextPhaseText: {
    color: '#7F90A6',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  permissionScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: '#07101E',
  },
  permissionCard: {
    alignItems: 'center',
    padding: 25,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#1D3549',
    backgroundColor: '#0A1A2B',
  },
  permissionIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#102B31',
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 18,
  },
  permissionText: {
    color: '#91A0B6',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  primaryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    padding: 16,
    borderRadius: 17,
    backgroundColor: '#70F7D4',
    marginTop: 22,
  },
  primaryButtonText: {
    color: '#081426',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    padding: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#203047',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#C8D2DF',
    fontSize: 13,
    fontWeight: '800',
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  cameraTopBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  cameraRoundButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: 'rgba(19, 29, 41, 0.82)',
  },
  cameraInstruction: {
    flex: 1,
    alignItems: 'center',
  },
  cameraInstructionTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  cameraInstructionText: {
    color: '#B7C1CD',
    fontSize: 10,
    marginTop: 3,
  },
  documentFrame: {
    position: 'absolute',
    top: '21%',
    right: '8%',
    bottom: '21%',
    left: '8%',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(112, 247, 212, 0.88)',
  },
  cameraBottomBar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    gap: 12,
    paddingTop: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#70F7D4',
  },
  cameraError: {
    maxWidth: '86%',
    color: '#FFD1D1',
    fontSize: 11,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
