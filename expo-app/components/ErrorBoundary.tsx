import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { withScope, captureException } from '../services/sentry-shim';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary] Erro capturado:', error.message);
    if (__DEV__) console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    // Report to Sentry for production crash tracking. Tag as react-error-boundary
    // for filtering / Apple reviewer triage. Wrapped in try/catch so a Sentry
    // failure never re-throws inside componentDidCatch (which would be fatal).
    try {
      withScope((scope) => {
        scope.setTag('error.boundary', 'root');
        scope.setLevel('fatal');
        scope.setContext('react', {
          componentStack: errorInfo.componentStack ?? undefined,
        });
        captureException(error);
      });
    } catch (sentryErr) {
      if (__DEV__) console.warn('[ErrorBoundary] Sentry capture failed:', sentryErr);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning-outline" size={48} color={Colors.white} />
            </View>

            <Text style={styles.title}>{i18n.t('errorBoundary.title')}</Text>
            <Text style={styles.description}>{i18n.t('errorBoundary.description')}</Text>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorBox} nestedScrollEnabled>
                <Text style={styles.errorText}>{this.state.error.message}</Text>
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.resetError}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={20} color={Colors.white} />
              <Text style={styles.retryText}>{i18n.t('errorBoundary.retry')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.title2,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  errorBox: {
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xxl,
    maxHeight: 120,
    width: '100%',
  },
  errorText: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.regular,
    color: Colors.coral,
    fontFamily: 'monospace',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  retryText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
});
