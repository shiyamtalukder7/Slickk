import type * as DocumentPickerModule from 'expo-document-picker';
import { fetch as expoFetch } from 'expo/fetch';
import {
  Directory,
  File,
  Paths,
} from 'expo-file-system';

import { getSlickkApiUrl } from '@/config/api';
import {
  getSlickkAuthorizationHeaders,
  resolveSlickkStudentId,
} from '@/services/api-auth';

let documentPicker: typeof DocumentPickerModule | null =
  null;

try {
  documentPicker =
    require('expo-document-picker') as typeof DocumentPickerModule;
} catch {
  // Older native clients may not include this module.
}

const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
const MAX_MATERIALS = 12;
const MATERIAL_DIRECTORY_NAME =
  'slickk-learning-materials';
const MANIFEST_NAME = 'materials.json';

const ALLOWED_DOCUMENT_TYPES = [
  'image/*',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export type LearningMaterial = {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  source: 'camera' | 'file';
  createdAt: string;
  width?: number;
  height?: number;
};

export type MaterialAnalysisResult = {
  materialId: string;
  name: string;
  kind: 'image' | 'pdf' | 'text';
  documentId: string;
  pageCount: number;
  ocrPageCount: number;
  duplicate: boolean;
  previewText?: string;
  regions?: number;
};

export class LearningMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LearningMaterialError';
  }
}

function materialDirectory() {
  return new Directory(
    Paths.cache,
    MATERIAL_DIRECTORY_NAME
  );
}

function ensureMaterialDirectory() {
  const directory = materialDirectory();
  directory.create({
    idempotent: true,
    intermediates: true,
  });
  return directory;
}

function manifestFile() {
  return new File(
    ensureMaterialDirectory(),
    MANIFEST_NAME
  );
}

function safeFileName(name: string) {
  const normalized = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'learning-material';
}

function uniqueFileName(name: string) {
  const cleaned = safeFileName(name);
  const dotIndex = cleaned.lastIndexOf('.');
  const stem =
    dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned;
  const extension =
    dotIndex > 0 ? cleaned.slice(dotIndex) : '';
  const token = Math.random().toString(36).slice(2, 8);

  return `${Date.now()}-${token}-${stem}${extension}`;
}

async function readManifest() {
  const manifest = manifestFile();

  if (!manifest.exists) {
    return [] as LearningMaterial[];
  }

  try {
    const parsed = JSON.parse(
      await manifest.text()
    ) as LearningMaterial[];

    return parsed.filter(
      (material) =>
        typeof material.id === 'string' &&
        typeof material.uri === 'string' &&
        new File(material.uri).exists
    );
  } catch {
    return [];
  }
}

function writeManifest(materials: LearningMaterial[]) {
  const manifest = manifestFile();

  if (!manifest.exists) {
    manifest.create();
  }

  manifest.write(JSON.stringify(materials));
}

async function addMaterial(input: {
  uri: string;
  name: string;
  mimeType: string;
  source: LearningMaterial['source'];
  width?: number;
  height?: number;
}) {
  const current = await readManifest();

  if (current.length >= MAX_MATERIALS) {
    throw new LearningMaterialError(
      `You can prepare up to ${MAX_MATERIALS} materials at a time. Remove one before adding another.`
    );
  }

  const sourceFile = new File(input.uri);
  const sourceSize = sourceFile.size ?? 0;

  if (sourceSize > MAX_MATERIAL_BYTES) {
    throw new LearningMaterialError(
      'This file is larger than the 25 MB temporary-material limit.'
    );
  }

  const destination = new File(
    ensureMaterialDirectory(),
    uniqueFileName(input.name)
  );

  await sourceFile.copy(destination);

  const material: LearningMaterial = {
    id: destination.name,
    name: safeFileName(input.name),
    uri: destination.uri,
    mimeType: input.mimeType,
    size: destination.size ?? sourceSize,
    source: input.source,
    createdAt: new Date().toISOString(),
    width: input.width,
    height: input.height,
  };
  const next = [material, ...current];

  writeManifest(next);
  return next;
}

export async function loadLearningMaterials() {
  const materials = await readManifest();
  writeManifest(materials);
  return materials;
}

export async function addCameraMaterial(input: {
  uri: string;
  width: number;
  height: number;
}) {
  return addMaterial({
    uri: input.uri,
    name: `worksheet-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    source: 'camera',
    width: input.width,
    height: input.height,
  });
}

export async function pickLearningMaterials() {
  if (!documentPicker) {
    throw new LearningMaterialError(
      'File selection requires the corrected Slickk development build.'
    );
  }

  const result = await documentPicker.getDocumentAsync({
    type: ALLOWED_DOCUMENT_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return loadLearningMaterials();
  }

  let materials = await loadLearningMaterials();

  if (
    materials.length + result.assets.length >
    MAX_MATERIALS
  ) {
    throw new LearningMaterialError(
      `You can prepare up to ${MAX_MATERIALS} materials at a time. Choose fewer files or remove existing materials first.`
    );
  }

  if (
    result.assets.some(
      (asset) =>
        typeof asset.size === 'number' &&
        asset.size > MAX_MATERIAL_BYTES
    )
  ) {
    throw new LearningMaterialError(
      'One of the selected files is larger than the 25 MB temporary-material limit.'
    );
  }

  for (const asset of result.assets) {
    materials = await addMaterial({
      uri: asset.uri,
      name: asset.name,
      mimeType:
        asset.mimeType || 'application/octet-stream',
      source: 'file',
    });
  }

  return materials;
}

export async function removeLearningMaterial(
  materialId: string
) {
  const current = await readManifest();
  const material = current.find(
    (item) => item.id === materialId
  );

  if (material) {
    const file = new File(material.uri);

    if (file.exists) {
      file.delete();
    }
  }

  const next = current.filter(
    (item) => item.id !== materialId
  );
  writeManifest(next);
  return next;
}

export async function clearLearningMaterials() {
  const directory = materialDirectory();

  if (directory.exists) {
    directory.delete();
  }

  ensureMaterialDirectory();
  writeManifest([]);
  return [] as LearningMaterial[];
}

export async function analyzeLearningMaterials(
  materials: LearningMaterial[]
) {
  const studentId =
    await resolveSlickkStudentId();

  const results: MaterialAnalysisResult[] = [];

  for (const material of materials) {
    const file = new File(material.uri);
    const response = await expoFetch(
      getSlickkApiUrl(
        `/api/students/${encodeURIComponent(
          studentId
        )}/materials/analyze`
      ),
      {
        method: 'POST',
        headers: {
          ...(await getSlickkAuthorizationHeaders()),
          'Content-Type': 'application/octet-stream',
          'X-Material-Name': encodeURIComponent(
            material.name
          ),
          'X-Material-Type': material.mimeType,
        },
        body: file,
      }
    );
    const payload = (await response.json()) as {
      error?: string;
      result?: {
        kind: 'image' | 'pdf' | 'text';
        document?: { id?: string };
        pageCount: number;
        ocrPageCount: number;
        duplicate: boolean;
        previewText?: string;
        regions?: number;
      };
    };

    if (!response.ok || !payload.result) {
      throw new LearningMaterialError(
        payload.error ||
          `Slickk could not analyze ${material.name}.`
      );
    }

    results.push({
      materialId: material.id,
      name: material.name,
      kind: payload.result.kind,
      documentId: payload.result.document?.id || '',
      pageCount: payload.result.pageCount,
      ocrPageCount: payload.result.ocrPageCount,
      duplicate: payload.result.duplicate,
      previewText: payload.result.previewText,
      regions: payload.result.regions,
    });
  }

  return results;
}
