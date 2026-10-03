import type { Locale } from './config';

const zhTW = {
  'test.hello': '你好，{name}！',
  'language.label': '語言',
  'login.title': '登入',
  'login.registerTitle': '建立帳號',
  'login.username': '帳號',
  'login.password': '密碼',
  'login.submit': '登入',
  'login.registerSubmit': '建立帳號',
  'login.switchToRegister': '還沒有帳號？註冊',
  'login.switchToLogin': '已有帳號？登入',
  'login.registered': '註冊成功，請用剛才的帳號登入。',
  'login.errorGeneric': '發生錯誤，請再試一次',
  'login.errorNetwork': '網路錯誤，請再試一次',
  'home.title': '路線記憶訓練器',
  'home.subtitle': '先看看今天要複習什麼，再選路線練習。',
  'home.reviewHeading': '待複習',
  'home.trendHeading': '精熟度趨勢',
  'home.routesHeading': '所有路線',
} as const;

export type MessageKey = keyof typeof zhTW;

const en: Record<MessageKey, string> = {
  'test.hello': 'Hello, {name}!',
  'language.label': 'Language',
  'login.title': 'Sign in',
  'login.registerTitle': 'Create account',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.registerSubmit': 'Create account',
  'login.switchToRegister': "Don't have an account? Register",
  'login.switchToLogin': 'Already have an account? Sign in',
  'login.registered': 'Registered! Please sign in with your new account.',
  'login.errorGeneric': 'Something went wrong. Please try again.',
  'login.errorNetwork': 'Network error. Please try again.',
  'home.title': 'Route Memory Trainer',
  'home.subtitle': "See what to review today, then pick a route to practise.",
  'home.reviewHeading': 'Due for review',
  'home.trendHeading': 'Mastery trend',
  'home.routesHeading': 'All routes',
};

export const messages: Record<Locale, Record<MessageKey, string>> = {
  'zh-TW': zhTW,
  en,
};
