import React, { Component, ErrorInfo, ReactNode } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorLogged: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private removeRejectionListener?: () => void;
  private removeErrorListener?: () => void;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorLogged: false
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorLogged: false };
  }

  public componentDidMount() {
    // Capture unhandled promise rejections (network failures, Firestore timeouts)
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled Promise Rejection');
      const stack = reason instanceof Error ? reason.stack || '' : '';

      this.logErrorToFirestore({
        errorType: 'network_or_async_rejection',
        message,
        stack,
        url: window.location.href,
        pathname: window.location.pathname
      });
    };

    // Capture global uncaught runtime errors
    const handleError = (event: ErrorEvent) => {
      this.logErrorToFirestore({
        errorType: 'uncaught_window_error',
        message: event.message || 'Window error',
        stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
        url: window.location.href,
        pathname: window.location.pathname
      });
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    this.removeRejectionListener = () => window.removeEventListener('unhandledrejection', handleRejection);
    this.removeErrorListener = () => window.removeEventListener('error', handleError);
  }

  public componentWillUnmount() {
    if (this.removeRejectionListener) this.removeRejectionListener();
    if (this.removeErrorListener) this.removeErrorListener();
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.logErrorToFirestore({
      errorType: 'react_render_error',
      message: error.message || 'Unknown render error',
      name: error.name || 'Error',
      stack: error.stack || '',
      componentStack: errorInfo?.componentStack || '',
      url: window.location.href,
      pathname: window.location.pathname
    });
  }

  private async logErrorToFirestore(details: {
    errorType: string;
    message: string;
    name?: string;
    stack?: string;
    componentStack?: string;
    url: string;
    pathname: string;
  }) {
    try {
      const errorDoc = {
        ...details,
        userAgent: navigator.userAgent,
        userId: auth.currentUser?.uid || 'anonymous',
        userEmail: auth.currentUser?.email || 'anonymous',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'app_errors'), errorDoc);
      this.setState({ errorLogged: true });
    } catch (loggingErr) {
      // In case offline or Firestore unreachable, keep safe in console
      console.warn('Logging error to Firestore app_errors failed:', loggingErr);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      let errorMessage = 'Une anomalie inattendue a été interceptée.';
      let details = '';

      if (this.state.error) {
        try {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed && parsed.error) {
            if (parsed.error.includes('permission-denied')) {
              errorMessage = "Vous n'avez pas l'autorisation d'accéder à ces informations.";
            } else {
              errorMessage = parsed.error;
            }
            details = `Opération: ${parsed.operationType}, Chemin: ${parsed.path}`;
          }
        } catch {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 text-center border border-gray-100 dark:border-gray-700 space-y-5">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white">Une erreur est survenue</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
                {errorMessage}
              </p>
              {details && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-mono">{details}</p>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-gray-900/50 rounded-xl border border-slate-200 dark:border-gray-700 text-xs text-slate-600 dark:text-gray-400 flex items-center gap-2 justify-center">
              <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {this.state.errorLogged 
                  ? "Rapport d'erreur envoyé à l'équipe technique (app_errors)." 
                  : "Journalisation de l'erreur en cours..."}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Recharger la page
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
                className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                Accueil
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
