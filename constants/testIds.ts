/**
 * Central registry of every `testID` used in the app, so E2E specs import
 * the same literals components render and a rename can't leave them behind.
 */

// react-native-web renders the `testID` prop as a `data-testid` attribute, so
// these double as the selectors E2E specs query — import this file from specs

// rather than repeating the literals, so a rename can't leave them behind
export const TEST_IDS = {
  signIn: {
    email: 'sign-in-email',
    password: 'sign-in-password',
    submit: 'sign-in-submit',
    error: 'sign-in-error',
  },
  signUp: {
    email: 'sign-up-email',
    password: 'sign-up-password',
    confirmPassword: 'sign-up-confirm-password',
    submit: 'sign-up-submit',
    error: 'sign-up-error',
  },
  postHistoryCard: {
    delete: 'post-history-delete',
  },
} as const;
