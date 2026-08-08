import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';

import { getSlickkApiUrl } from '@/config/api';

const SLICKK_API_TOKEN_KEY = 'slickk.api.token.v1';

export const LOCAL_DEVELOPMENT_STUDENT_ID =
  'local-student';

const MINIMUM_API_TOKEN_LENGTH = 24;

const SECURE_STORE_OPTIONS = {
  keychainService: 'slickk.api.credentials',
} satisfies SecureStore.SecureStoreOptions;

const SESSION_ROLES = new Set([
  'local',
  'student',
  'guardian',
  'teacher',
  'school-admin',
]);

export type SlickkSessionIdentity = {
  role:
    | 'local'
    | 'student'
    | 'guardian'
    | 'teacher'
    | 'school-admin';
  subjectId: string;
  requestId: string;
};

let cachedSession: SlickkSessionIdentity | null =
  null;

let pendingSession:
  | Promise<SlickkSessionIdentity>
  | null = null;

export class SlickkCredentialError extends Error {
  code: string;

  constructor(
    message: string,
    code = 'SLICKK_CREDENTIAL_ERROR'
  ) {
    super(message);
    this.name = 'SlickkCredentialError';
    this.code = code;
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeToken(value: string) {
  return value.trim();
}

function validateToken(value: string) {
  const token = normalizeToken(value);

  if (token.length < MINIMUM_API_TOKEN_LENGTH) {
    throw new SlickkCredentialError(
      'The Slickk access token must contain at least 24 characters.',
      'INVALID_SLICKK_API_TOKEN'
    );
  }

  return token;
}

async function secureStoreAvailable() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function clearSessionCache() {
  cachedSession = null;
  pendingSession = null;
}

function parseSessionIdentity(
  value: unknown
): SlickkSessionIdentity {
  if (!isRecord(value)) {
    throw new SlickkCredentialError(
      'Slickk returned an invalid session identity.',
      'INVALID_SLICKK_SESSION'
    );
  }

  const role =
    typeof value.role === 'string'
      ? value.role
      : '';

  const subjectId =
    typeof value.subjectId === 'string'
      ? value.subjectId.trim()
      : '';

  const requestId =
    typeof value.requestId === 'string'
      ? value.requestId.trim()
      : '';

  if (
    !SESSION_ROLES.has(role) ||
    !subjectId ||
    !requestId
  ) {
    throw new SlickkCredentialError(
      'Slickk returned an incomplete session identity.',
      'INVALID_SLICKK_SESSION'
    );
  }

  return {
    role: role as SlickkSessionIdentity['role'],
    subjectId,
    requestId,
  };
}

async function readSessionError(response: Response) {
  try {
    const value: unknown = await response.json();

    if (isRecord(value)) {
      const message =
        typeof value.error === 'string'
          ? value.error
          : 'Slickk could not verify this session.';

      const code =
        typeof value.code === 'string'
          ? value.code
          : `HTTP_${response.status}`;

      return new SlickkCredentialError(
        message,
        code
      );
    }
  } catch {
    // Use the status-based error below.
  }

  return new SlickkCredentialError(
    `Slickk could not verify this session (${response.status}).`,
    `HTTP_${response.status}`
  );
}

export async function loadSlickkApiToken() {
  if (!(await secureStoreAvailable())) {
    return null;
  }

  const storedValue = await SecureStore.getItemAsync(
    SLICKK_API_TOKEN_KEY,
    SECURE_STORE_OPTIONS
  );

  if (!storedValue) {
    return null;
  }

  const token = normalizeToken(storedValue);

  return token.length >= MINIMUM_API_TOKEN_LENGTH
    ? token
    : null;
}

export async function saveSlickkApiToken(
  value: string
) {
  const token = validateToken(value);

  if (!(await secureStoreAvailable())) {
    throw new SlickkCredentialError(
      'Secure credential storage is unavailable on this device.',
      'SECURE_STORAGE_UNAVAILABLE'
    );
  }

  await SecureStore.setItemAsync(
    SLICKK_API_TOKEN_KEY,
    token,
    SECURE_STORE_OPTIONS
  );

  clearSessionCache();
}

export async function verifyAndSaveSlickkApiToken(
  value: string
) {
  const token = validateToken(value);

  if (!(await secureStoreAvailable())) {
    throw new SlickkCredentialError(
      'Secure credential storage is unavailable on this device.',
      'SECURE_STORAGE_UNAVAILABLE'
    );
  }

  const response = await expoFetch(
    getSlickkApiUrl('/api/session'),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw await readSessionError(response);
  }

  const session = parseSessionIdentity(
    await response.json()
  );

  await SecureStore.setItemAsync(
    SLICKK_API_TOKEN_KEY,
    token,
    SECURE_STORE_OPTIONS
  );

  clearSessionCache();
  cachedSession = session;

  return session;
}

export async function clearSlickkApiToken() {
  clearSessionCache();

  if (!(await secureStoreAvailable())) {
    return;
  }

  await SecureStore.deleteItemAsync(
    SLICKK_API_TOKEN_KEY,
    SECURE_STORE_OPTIONS
  );
}

export async function hasSlickkApiToken() {
  return (await loadSlickkApiToken()) !== null;
}

export async function getSlickkAuthorizationHeaders() {
  const token = await loadSlickkApiToken();

  if (!token) {
    return {} as Record<string, string>;
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function requestSlickkSession() {
  const authorizationHeaders =
    await getSlickkAuthorizationHeaders();

  const response = await expoFetch(
    getSlickkApiUrl('/api/session'),
    {
      method: 'GET',
      headers: {
        ...authorizationHeaders,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw await readSessionError(response);
  }

  const value: unknown = await response.json();

  return parseSessionIdentity(value);
}

export async function loadSlickkSession(
  forceRefresh = false
) {
  if (!forceRefresh && cachedSession) {
    return cachedSession;
  }

  if (!forceRefresh && pendingSession) {
    return pendingSession;
  }

  const request = requestSlickkSession()
    .then((session) => {
      cachedSession = session;
      return session;
    })
    .finally(() => {
      if (pendingSession === request) {
        pendingSession = null;
      }
    });

  pendingSession = request;

  return request;
}

export async function resolveSlickkStudentId(
  forceRefresh = false
) {
  const token = await loadSlickkApiToken();

  if (!token) {
    return LOCAL_DEVELOPMENT_STUDENT_ID;
  }

  const session = await loadSlickkSession(
    forceRefresh
  );

  if (
    session.role !== 'local' &&
    session.role !== 'student'
  ) {
    throw new SlickkCredentialError(
      'This credential is not assigned to a student account.',
      'STUDENT_SESSION_REQUIRED'
    );
  }

  return session.subjectId;
}
