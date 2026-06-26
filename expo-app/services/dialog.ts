import { Alert, Platform } from 'react-native';
import type { AlertButton, AlertOptions } from 'react-native';

/**
 * Cross-platform replacement for `Alert.alert`.
 *
 * react-native-web ships `Alert` as a no-op (`static alert() {}`) — it renders
 * nothing and NEVER invokes the buttons' `onPress`. That silently breaks every
 * confirmation / feedback flow on the web target (sign-out, account deletion,
 * login validation, restore purchases, etc.).
 *
 * On native this delegates to `Alert.alert` unchanged. On web it maps to the
 * browser primitives while preserving button `onPress` semantics:
 *   - 0 / 1 button            → window.alert (then fires the single onPress)
 *   - 1 actionable + cancel   → window.confirm (OK → action, Cancel → cancel)
 *   - N actionable choices    → numbered window.prompt
 *
 * Drop-in: same signature as Alert.alert, so call sites only change the name.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }

  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const actionable = buttons.filter((b) => b.style !== 'cancel');

  // Pure information (single button, no cancel) → alert + fire its handler.
  if (buttons.length === 1) {
    window.alert(text);
    buttons[0]?.onPress?.();
    return;
  }

  // No actionable button (only a cancel/dismiss) → alert + fire cancel handler.
  if (actionable.length === 0) {
    window.alert(text);
    cancelButton?.onPress?.();
    return;
  }

  // Single action (optionally with cancel) → confirm.
  if (actionable.length === 1) {
    const confirmed = window.confirm(text);
    if (confirmed) {
      actionable[0]?.onPress?.();
    } else {
      cancelButton?.onPress?.();
    }
    return;
  }

  // Multiple actionable choices (e.g. language / action sheet) → numbered prompt.
  const labels = actionable.map((b, i) => `${i + 1}. ${b.text ?? ''}`).join('\n');
  const answer = window.prompt(`${text}\n\n${labels}`.trim(), '');
  if (answer == null) {
    cancelButton?.onPress?.();
    return;
  }
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < actionable.length) {
    actionable[idx]?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}

/** Convenience: a simple notification (no buttons / single OK). */
export function notify(title: string, message?: string, onDismiss?: () => void): void {
  showAlert(title, message, onDismiss ? [{ text: 'OK', onPress: onDismiss }] : undefined);
}

/**
 * Convenience: an awaitable confirmation. Resolves true if the user confirmed.
 */
export function confirmAsync(
  title: string,
  message?: string,
  confirmText = 'OK',
  cancelText = 'Cancel',
): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, onPress: () => resolve(true) },
    ]);
  });
}
