/* TaskNotes - settings you may change.
   googleClientId: the Google sign-in id. It is the same Google project as Where's My Money.
   It is not a secret, so it is fine in a public repo. Empty = no "Sign in with Google" button.
   workerUrl: the TaskNotes Worker, which sends the ⏰ alarms. */
window.TN_CONFIG = Object.assign({googleClientId: '1018863337394-dhhfi006uhdf715dovuqetkl22tj5gdo.apps.googleusercontent.com',
  workerUrl: 'https://tasknotes.df-ai-lab-hq.workers.dev'}, window.TN_CONFIG || {});
