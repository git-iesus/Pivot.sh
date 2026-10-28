import React, { useState, useMemo } from 'react';
import {
  AuthUser,
  signInWithEmail,
  signUpWithEmail,
  extractLegacyLocalData,
} from '../../services/cloudSync';
import {
  Cloud,
  Lock,
  Mail,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Detecta se existem dados locais no navegador que serão migrados automaticamente
  const hasLocalDataToMigrate = useMemo(() => {
    return extractLegacyLocalData() !== null;
  }, []);

  const handleSwitchMode = (nextMode: 'login' | 'signup') => {
    setMode(nextMode);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Informe um endereço de e-mail válido.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('As senhas não coincidem. Verifique a confirmação de senha.');
      return;
    }

    setIsLoading(true);
    try {
      const user =
        mode === 'login'
          ? await signInWithEmail(trimmedEmail, password)
          : await signUpWithEmail(trimmedEmail, password);
      onAuthenticated(user);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ocorreu um erro ao autenticar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-screen-backdrop">
      <div className="auth-card-container">
        {/* Cabeçalho da Marca Pivot.sh */}
        <div className="auth-brand-header">
          <div className="auth-brand-top-row">
            <div className="auth-brand-title-group">
              <span className="auth-brand-logo-text">Pivot.sh</span>
              <span className="auth-cloud-badge">
                <Cloud size={12} />
                <span>Cloud Sync</span>
              </span>
            </div>
          </div>
          <p className="auth-brand-subtitle">
            Sincronização multi-dispositivo em tempo real para seus cronogramas, EAP e arquitetura Nexo.
          </p>
        </div>

        {/* Abas Login / Criar Conta */}
        <div className="auth-tabs-switcher">
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('login')}
          >
            Entrar na Conta
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('signup')}
          >
            Criar Conta
          </button>
        </div>

        {/* Aviso de Migração Automática de Dados Locais */}
        {hasLocalDataToMigrate && (
          <div className="auth-migration-banner">
            <ShieldCheck size={16} className="migration-icon" />
            <div>
              <strong>Progresso local detectado!</strong>
              <span>
                Seus projetos e configurações do Nexo salvos neste navegador serão sincronizados
                automaticamente com sua conta assim que você entrar.
              </span>
            </div>
          </div>
        )}

        {/* Alerta de Erro Visível na Interface */}
        {errorMessage && (
          <div className="auth-error-alert" role="alert">
            <AlertCircle size={16} className="auth-error-icon" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulário de Autenticação */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field-group">
            <label htmlFor="auth-email">E-mail</label>
            <div className="auth-input-wrapper">
              <Mail size={15} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                className="auth-input"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoComplete="email"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="auth-field-group">
            <label htmlFor="auth-password">Senha</label>
            <div className="auth-input-wrapper">
              <Lock size={15} className="auth-input-icon" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="Mínimo de 6 caracteres"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="auth-field-group">
              <label htmlFor="auth-confirm-password">Confirmar Senha</label>
              <div className="auth-input-wrapper">
                <Lock size={15} className="auth-input-icon" />
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Repita a senha escolhida"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={16} className="spin-icon" />
                <span>{mode === 'login' ? 'Autenticando...' : 'Criando conta e sincronizando...'}</span>
              </>
            ) : (
              <>
                <span>{mode === 'login' ? 'Entrar e Sincronizar' : 'Criar Conta e Sincronizar'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Rodapé de Alternância */}
        <div className="auth-card-footer">
          {mode === 'login' ? (
            <span>
              Ainda não possui uma conta?{' '}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleSwitchMode('signup')}
              >
                Criar conta gratuitamente
              </button>
            </span>
          ) : (
            <span>
              Já possui uma conta cadastrada?{' '}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleSwitchMode('login')}
              >
                Fazer login
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
