import { Locale } from './config';

/**
 * Change 30: 訊息字典（en 為型別基準，zh-TW 必須有相同 key 形狀）。
 * 本 change 範圍：登入頁、首頁 shell、AuthStatus、語言切換。其餘元件後續擴充。
 */
const en = {
  login: {
    titleLogin: 'Sign in',
    titleRegister: 'Create account',
    labelUsername: 'Username',
    labelPassword: 'Password',
    buttonLogin: 'Sign in',
    buttonRegister: 'Create account',
    switchToRegister: "Don't have an account? Register",
    switchToLogin: 'Already have an account? Sign in',
    registerSuccess: 'Registered successfully. Please sign in with your new account.',
    errorGeneric: 'Something went wrong. Please try again.',
    errorNetwork: 'Network error. Please try again.',
  },
  home: {
    title: 'Route Memory Trainer',
    subtitle: 'See what to review today, then pick a route to practise.',
    sectionReview: 'To review',
    sectionTrend: 'Mastery trend',
    sectionRoutes: 'All routes',
  },
  auth: {
    signedInAs: 'Driver {name}',
    logout: 'Log out',
  },
  lang: {
    label: 'Language',
    en: 'English',
    'zh-TW': '繁體中文',
  },
};

// Messages 型別取 en 的結構（值放寬為 string）；zh-TW 必須有相同 key 形狀。
export type Messages = typeof en;

const zhTW: Messages = {
  login: {
    titleLogin: '登入',
    titleRegister: '建立帳號',
    labelUsername: '帳號',
    labelPassword: '密碼',
    buttonLogin: '登入',
    buttonRegister: '建立帳號',
    switchToRegister: '還沒有帳號？註冊',
    switchToLogin: '已有帳號？登入',
    registerSuccess: '註冊成功，請用剛才的帳號登入。',
    errorGeneric: '發生錯誤，請再試一次',
    errorNetwork: '網路錯誤，請再試一次',
  },
  home: {
    title: '路線記憶訓練器',
    subtitle: '先看看今天要複習什麼，再選路線練習。',
    sectionReview: '待複習',
    sectionTrend: '精熟度趨勢',
    sectionRoutes: '所有路線',
  },
  auth: {
    signedInAs: '司機 {name}',
    logout: '登出',
  },
  lang: {
    label: '語言',
    en: 'English',
    'zh-TW': '繁體中文',
  },
};

export const messages: Record<Locale, Messages> = {
  en,
  'zh-TW': zhTW,
};
