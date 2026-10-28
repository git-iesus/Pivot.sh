import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Task,
  Resource,
  ProjectMetadata,
  NexoProjectState,
} from '../types/project';
import { defaultTasks, defaultResources, defaultMetadata } from '../data/sampleProjects';
import { defaultNexoState } from '../components/Nexo/NexoPlugin';

export interface AuthUser {
  id: string;
  email: string;
  accessToken?: string;
}

export interface ProjectCloudPayload {
  tasks: Task[];
  resources: Resource[];
  metadata: ProjectMetadata;
  nexoState: NexoProjectState;
  rowHeights: Record<string, number>;
  updatedAt?: string;
}

export interface LoadProjectResult {
  payload: ProjectCloudPayload;
  migratedFromLocal: boolean;
  source: 'cloud' | 'migrated' | 'default';
}

const RUNTIME_CONFIG_KEY = 'pivot_supabase_runtime_config';
const LOCAL_FALLBACK_USERS_KEY = 'pivot_local_auth_users';
const LOCAL_FALLBACK_SESSION_KEY = 'pivot_local_auth_session_jwt';
const LOCAL_FALLBACK_DB_PREFIX = 'pivot_cloud_db_user_';
const USER_CACHE_PREFIX = 'pivot_user_cache_';

// Chaves legadas do localStorage (usadas antes do sistema de contas para migração automática)
const LEGACY_KEYS = {
  tasks: 'ms_project_tasks',
  resources: 'ms_project_resources',
  metadata: 'ms_project_metadata',
  nexo: 'ms_project_nexo',
  rowHeights: 'ms_project_row_heights',
};

let supabaseInstance: SupabaseClient | null = null;
let cachedConfigSignature = '';

export function getSupabaseCredentials(): { url: string; anonKey: string; isConfigured: boolean } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (
    envUrl &&
    envKey &&
    !envUrl.includes('SEU-PROJETO') &&
    !envKey.includes('SUA-ANON-PUBLIC-KEY')
  ) {
    return { url: envUrl, anonKey: envKey, isConfigured: true };
  }

  try {
    const saved = localStorage.getItem(RUNTIME_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) {
        return {
          url: String(parsed.url).trim(),
          anonKey: String(parsed.anonKey).trim(),
          isConfigured: true,
        };
      }
    }
  } catch {
    // ignore
  }

  return { url: '', anonKey: '', isConfigured: false };
}

export function saveRuntimeSupabaseCredentials(url: string, anonKey: string): void {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();
  if (!cleanUrl || !cleanKey) {
    localStorage.removeItem(RUNTIME_CONFIG_KEY);
  } else {
    localStorage.setItem(
      RUNTIME_CONFIG_KEY,
      JSON.stringify({ url: cleanUrl, anonKey: cleanKey })
    );
  }
  supabaseInstance = null;
  cachedConfigSignature = '';
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseCredentials();
  if (!isConfigured) return null;

  const sig = `${url}::${anonKey}`;
  if (!supabaseInstance || cachedConfigSignature !== sig) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'pivot_supabase_auth_token',
      },
    });
    cachedConfigSignature = sig;
  }
  return supabaseInstance;
}

export function translateAuthError(rawMessage: string): string {
  const msg = (rawMessage || '').toLowerCase();
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('invalid email or password') ||
    msg.includes('credenciais inválidas')
  ) {
    return 'Credenciais inválidas. Verifique seu e-mail e senha.';
  }
  if (
    msg.includes('user already registered') ||
    msg.includes('already been registered') ||
    msg.includes('already exists') ||
    msg.includes('e-mail já cadastrado')
  ) {
    return 'E-mail já cadastrado. Faça login ou utilize outro endereço de e-mail.';
  }
  if (
    msg.includes('password should be at least 6 characters') ||
    msg.includes('weak_password') ||
    msg.includes('at least 6 characters')
  ) {
    return 'A senha deve ter no mínimo 6 caracteres.';
  }
  if (msg.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada ou desative "Confirm email" em Authentication -> Providers -> Email no Supabase.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'Informe um endereço de e-mail válido.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Não foi possível conectar ao servidor Supabase. Verifique sua conexão ou as chaves configuradas.';
  }
  return rawMessage || 'Ocorreu um erro inesperado na autenticação.';
}

// ============================================================================
// GERENCIAMENTO DE SESSÃO E AUTENTICAÇÃO (SUPABASE + FALLBACK LOCAL COM JWT)
// ============================================================================

export async function getActiveSessionUser(): Promise<AuthUser | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session?.user) {
        return {
          id: data.session.user.id,
          email: data.session.user.email || '',
          accessToken: data.session.access_token,
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  // Fallback de sessão persistente via Token quando o .env ainda não foi preenchido
  try {
    const rawSession = localStorage.getItem(LOCAL_FALLBACK_SESSION_KEY);
    if (!rawSession) return null;
    const parsed = JSON.parse(rawSession);
    if (parsed && parsed.user && parsed.user.id && parsed.accessToken) {
      return {
        id: parsed.user.id,
        email: parsed.user.email,
        accessToken: parsed.accessToken,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um endereço de e-mail válido.');
  }
  if (!password || password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      throw new Error(translateAuthError(error.message));
    }
    if (!data.user) {
      throw new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
    }
    return {
      id: data.user.id,
      email: data.user.email || cleanEmail,
      accessToken: data.session?.access_token,
    };
  }

  // Fallback local se as chaves Supabase ainda não estiverem no .env
  const usersRaw = localStorage.getItem(LOCAL_FALLBACK_USERS_KEY);
  const users: Array<{ id: string; email: string; passwordHash: string }> = usersRaw
    ? JSON.parse(usersRaw)
    : [];
  const found = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!found || found.passwordHash !== btoa(encodeURIComponent(password))) {
    throw new Error('Credenciais inválidas. Verifique seu e-mail e senha.');
  }

  const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
    JSON.stringify({ sub: found.id, email: found.email, iat: Date.now() })
  )}.signature`;

  const userObj: AuthUser = {
    id: found.id,
    email: found.email,
    accessToken: fakeJwt,
  };
  localStorage.setItem(
    LOCAL_FALLBACK_SESSION_KEY,
    JSON.stringify({ user: userObj, accessToken: fakeJwt, persistedAt: new Date().toISOString() })
  );
  return userObj;
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Informe um endereço de e-mail válido.');
  }
  if (!password || password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });
    if (error) {
      throw new Error(translateAuthError(error.message));
    }
    // No Supabase, quando "Confirm email" está ativado e o e-mail já existe, identities vem vazio
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('E-mail já cadastrado. Faça login ou utilize outro endereço de e-mail.');
    }
    if (!data.user) {
      throw new Error('Não foi possível criar a conta. Tente novamente.');
    }
    if (!data.session) {
      // Caso o projeto Supabase exija confirmação de e-mail, tenta login imediato ou avisa claramente
      const signInAttempt = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInAttempt.error || !signInAttempt.data.user) {
        throw new Error(
          'Conta criada! Verifique seu e-mail para confirmar o cadastro (ou desative "Confirm email" em Authentication -> Providers -> Email no painel do Supabase).'
        );
      }
      return {
        id: signInAttempt.data.user.id,
        email: signInAttempt.data.user.email || cleanEmail,
        accessToken: signInAttempt.data.session?.access_token,
      };
    }

    return {
      id: data.user.id,
      email: data.user.email || cleanEmail,
      accessToken: data.session?.access_token,
    };
  }

  // Fallback local se as chaves Supabase ainda não estiverem no .env
  const usersRaw = localStorage.getItem(LOCAL_FALLBACK_USERS_KEY);
  const users: Array<{ id: string; email: string; passwordHash: string }> = usersRaw
    ? JSON.parse(usersRaw)
    : [];
  const exists = users.some((u) => u.email.toLowerCase() === cleanEmail);
  if (exists) {
    throw new Error('E-mail já cadastrado. Faça login ou utilize outro endereço de e-mail.');
  }

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email: cleanEmail,
    passwordHash: btoa(encodeURIComponent(password)),
  };
  users.push(newUser);
  localStorage.setItem(LOCAL_FALLBACK_USERS_KEY, JSON.stringify(users));

  const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
    JSON.stringify({ sub: newUser.id, email: newUser.email, iat: Date.now() })
  )}.signature`;

  const userObj: AuthUser = {
    id: newUser.id,
    email: newUser.email,
    accessToken: fakeJwt,
  };
  localStorage.setItem(
    LOCAL_FALLBACK_SESSION_KEY,
    JSON.stringify({ user: userObj, accessToken: fakeJwt, persistedAt: new Date().toISOString() })
  );
  return userObj;
}

export async function signOutUser(): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
  localStorage.removeItem(LOCAL_FALLBACK_SESSION_KEY);
}

// ============================================================================
// DETECÇÃO E MIGRAÇÃO DE DADOS LOCAIS DO LOCALSTORAGE PARA A CONTA NA NUVEM
// ============================================================================

export function extractLegacyLocalData(): ProjectCloudPayload | null {
  try {
    const rawTasks = localStorage.getItem(LEGACY_KEYS.tasks);
    const rawResources = localStorage.getItem(LEGACY_KEYS.resources);
    const rawMeta = localStorage.getItem(LEGACY_KEYS.metadata);
    const rawNexo = localStorage.getItem(LEGACY_KEYS.nexo);
    const rawRowHeights = localStorage.getItem(LEGACY_KEYS.rowHeights);

    const hasAnyLegacy = Boolean(
      rawTasks || rawResources || rawMeta || rawNexo || rawRowHeights
    );
    if (!hasAnyLegacy) return null;

    const tasks: Task[] = rawTasks ? JSON.parse(rawTasks) : defaultTasks;
    const resources: Resource[] = rawResources ? JSON.parse(rawResources) : defaultResources;
    const parsedMeta = rawMeta ? JSON.parse(rawMeta) : {};
    const metadata: ProjectMetadata = {
      ...defaultMetadata,
      ...parsedMeta,
      activeWeekDays: parsedMeta.activeWeekDays || [1, 2, 3, 4, 5],
      exceptions: parsedMeta.exceptions || [],
    };
    const parsedNexo = rawNexo ? JSON.parse(rawNexo) : {};
    const nexoState: NexoProjectState = {
      ...defaultNexoState,
      ...parsedNexo,
      activePhase:
        parsedNexo.activePhase && parsedNexo.activePhase <= 4 ? parsedNexo.activePhase : 1,
      roleView: 'architect',
    };
    const rowHeights: Record<string, number> = rawRowHeights ? JSON.parse(rawRowHeights) : {};

    return {
      tasks,
      resources,
      metadata,
      nexoState,
      rowHeights,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearLegacyLocalData(): void {
  localStorage.removeItem(LEGACY_KEYS.tasks);
  localStorage.removeItem(LEGACY_KEYS.resources);
  localStorage.removeItem(LEGACY_KEYS.metadata);
  localStorage.removeItem(LEGACY_KEYS.nexo);
  localStorage.removeItem(LEGACY_KEYS.rowHeights);
}

export function createDefaultPayload(): ProjectCloudPayload {
  return {
    tasks: defaultTasks,
    resources: defaultResources,
    metadata: {
      ...defaultMetadata,
      activeWeekDays: defaultMetadata.activeWeekDays || [1, 2, 3, 4, 5],
      exceptions: defaultMetadata.exceptions || [],
    },
    nexoState: defaultNexoState,
    rowHeights: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCloudPayload(raw: any): ProjectCloudPayload {
  const parsedMeta = raw?.metadata || {};
  const parsedNexo = raw?.nexo_state || raw?.nexoState || {};

  return {
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : defaultTasks,
    resources: Array.isArray(raw?.resources) ? raw.resources : defaultResources,
    metadata: {
      ...defaultMetadata,
      ...parsedMeta,
      activeWeekDays: parsedMeta.activeWeekDays || [1, 2, 3, 4, 5],
      exceptions: parsedMeta.exceptions || [],
    },
    nexoState: {
      ...defaultNexoState,
      ...parsedNexo,
      activePhase:
        parsedNexo.activePhase && parsedNexo.activePhase <= 4 ? parsedNexo.activePhase : 1,
      roleView: 'architect',
    },
    rowHeights:
      raw?.row_heights || raw?.rowHeights
        ? (raw.row_heights || raw.rowHeights)
        : {},
    updatedAt: raw?.updated_at || raw?.updatedAt || new Date().toISOString(),
  };
}

// ============================================================================
// PERSISTÊNCIA E SINCRONIZAÇÃO EM NUVEM VINCULADA AO USER_ID
// ============================================================================

export async function saveUserProjectToCloud(
  user: AuthUser,
  payload: ProjectCloudPayload
): Promise<void> {
  const nowIso = new Date().toISOString();
  const fullPayload: ProjectCloudPayload = {
    ...payload,
    updatedAt: nowIso,
  };

  // Salva no cache isolado por user_id no navegador para resposta instantânea
  try {
    localStorage.setItem(`${USER_CACHE_PREFIX}${user.id}`, JSON.stringify(fullPayload));
  } catch {
    // ignore quota errors
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('user_projects').upsert(
      {
        user_id: user.id,
        email: user.email,
        tasks: fullPayload.tasks,
        resources: fullPayload.resources,
        metadata: fullPayload.metadata,
        nexo_state: fullPayload.nexoState,
        row_heights: fullPayload.rowHeights,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('Erro ao sincronizar projeto no Supabase:', error.message);
      throw new Error(error.message);
    }
    return;
  }

  // Fallback local isolado por user_id
  localStorage.setItem(`${LOCAL_FALLBACK_DB_PREFIX}${user.id}`, JSON.stringify(fullPayload));
}

export async function loadOrMigrateUserProject(user: AuthUser): Promise<LoadProjectResult> {
  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from('user_projects')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      // Usuário já possui dados na nuvem -> carrega os dados da nuvem!
      const cloudPayload = normalizeCloudPayload(data);
      localStorage.setItem(`${USER_CACHE_PREFIX}${user.id}`, JSON.stringify(cloudPayload));
      // Se havia dados legados não-autenticados, limpa para evitar conflito futuro
      clearLegacyLocalData();
      return {
        payload: cloudPayload,
        migratedFromLocal: false,
        source: 'cloud',
      };
    }

    // Não há dados na nuvem para este user_id (Conta nova ou primeiro login sem dados na nuvem):
    // Verifica se há dados salvos no localStorage para migração automática!
    const legacyData = extractLegacyLocalData();
    if (legacyData) {
      try {
        await saveUserProjectToCloud(user, legacyData);
        clearLegacyLocalData();
      } catch (e) {
        console.warn('Falha ao enviar migração inicial para o Supabase:', e);
      }
      return {
        payload: legacyData,
        migratedFromLocal: true,
        source: 'migrated',
      };
    }

    // Sem dados na nuvem e sem dados no localStorage -> cria projeto inicial na nuvem
    const defaultPayload = createDefaultPayload();
    try {
      await saveUserProjectToCloud(user, defaultPayload);
    } catch (e) {
      console.warn('Falha ao criar estado inicial no Supabase:', e);
    }
    return {
      payload: defaultPayload,
      migratedFromLocal: false,
      source: 'default',
    };
  }

  // Modo Fallback Local (quando .env ainda não foi configurado)
  const existingUserDb = localStorage.getItem(`${LOCAL_FALLBACK_DB_PREFIX}${user.id}`);
  if (existingUserDb) {
    const parsed = normalizeCloudPayload(JSON.parse(existingUserDb));
    clearLegacyLocalData();
    return {
      payload: parsed,
      migratedFromLocal: false,
      source: 'cloud',
    };
  }

  const legacyData = extractLegacyLocalData();
  if (legacyData) {
    await saveUserProjectToCloud(user, legacyData);
    clearLegacyLocalData();
    return {
      payload: legacyData,
      migratedFromLocal: true,
      source: 'migrated',
    };
  }

  const defaultPayload = createDefaultPayload();
  await saveUserProjectToCloud(user, defaultPayload);
  return {
    payload: defaultPayload,
    migratedFromLocal: false,
    source: 'default',
  };
}
