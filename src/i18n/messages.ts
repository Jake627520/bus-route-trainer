import { Locale } from './config';

/**
 * Change 30/31: 訊息字典（en 為型別基準，zh-TW 必須有相同 key 形狀）。
 * 不可對 en 加 `as const`，否則字面量型別會讓 zh-TW 無法賦值。
 */
const en = {
  common: {
    loading: 'Loading…',
    directionOutbound: 'Outbound',
    directionInbound: 'Inbound',
    directionOther: 'Direction {id}',
    noHeadsign: 'No destination',
  },
  status: {
    NOT_STARTED: 'Enrolled · not started',
    IN_PROGRESS: 'Learning',
    MASTERED: 'Mastered',
    notEnrolled: 'Not enrolled',
  },
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
  routeList: {
    loadError: 'Couldn’t load routes: {message}',
    empty: 'No routes available yet.',
    searchAria: 'Search routes',
    searchPlaceholder: 'Search routes (number or name)',
    noMatch: 'No matching routes.',
  },
  reviewNotifier: {
    notifTitle: 'Review reminder',
    notifBody: 'You have {count} cards to review',
    enableButton: 'Enable review reminders',
  },
  streakStat: {
    empty: 'Practise daily to build a streak.',
    current: '🔥 {days}-day streak',
    best: 'Best {days} days',
  },
  accuracyStat: {
    compactEmpty: 'Accuracy: no data yet',
    empty: 'No practice yet — try a few questions.',
    compact: 'Accuracy {pct}% ({passed}/{total})',
    title: 'Accuracy {pct}%',
    detail: '{passed} / {total} correct',
  },
  batchPractice: {
    button: 'Practise all due ({count} routes)',
  },
  masteryTrend: {
    empty: 'Your mastery progress curve will appear here after you practise.',
    aria: 'Mastery trend: peak {max} mastered, {days} days recorded',
    pointTitle: '{date}: {count} mastered',
  },
  reviewReminder: {
    allDone: 'All caught up for today 🎉',
    due: 'You have {count} cards to review',
    start: 'Start reviewing',
  },
  dashboard: {
    loadError: 'Couldn’t load the review list: {message}',
    empty: 'Not enrolled in any route yet — pick one below to start.',
    routeLabel: 'Route {routeId}',
    due: '{count} to review',
    noDue: 'None due',
    newCards: '{count} new',
    nextReview: 'Next review {time}',
    masteryLabel: 'Mastery',
    start: 'Start reviewing',
  },
  variant: {
    enrollFailed: 'Enrolment failed',
    loadError: 'Couldn’t load route variants: {message}',
    empty: 'No practisable variants for this route yet.',
    stopsTrips: '{stops} stops · {trips} trips',
    startPractice: 'Start practice',
    enrolling: 'Enrolling…',
    enroll: 'Enrol',
    enrollError: 'Enrolment failed: {message}',
  },
  routeDetail: {
    back: '← Back to routes',
    title: 'Route {routeId}',
    subtitle: 'Pick a direction/destination to enrol and start practising.',
  },
  recall: {
    batchProgress: 'Batch {current} / {total}',
    allDone: 'All done 🎉',
    nextRoute: 'Next route ({current} / {total})',
  },
};

// Messages 型別取 en 的結構（值放寬為 string）；zh-TW 必須有相同 key 形狀。
export type Messages = typeof en;

const zhTW: Messages = {
  common: {
    loading: '載入中…',
    directionOutbound: '去程',
    directionInbound: '返程',
    directionOther: '方向 {id}',
    noHeadsign: '未標示終點',
  },
  status: {
    NOT_STARTED: '已報名 · 尚未開始',
    IN_PROGRESS: '學習中',
    MASTERED: '已精熟',
    notEnrolled: '未報名',
  },
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
  routeList: {
    loadError: '無法載入路線：{message}',
    empty: '目前沒有可用的路線。',
    searchAria: '搜尋路線',
    searchPlaceholder: '搜尋路線（號碼或名稱）',
    noMatch: '找不到符合的路線。',
  },
  reviewNotifier: {
    notifTitle: '待複習提醒',
    notifBody: '你有 {count} 張卡片待複習',
    enableButton: '開啟複習提醒',
  },
  streakStat: {
    empty: '開始每天練習，累積連續天數。',
    current: '🔥 連續練習 {days} 天',
    best: '最佳 {days} 天',
  },
  accuracyStat: {
    compactEmpty: '正確率：尚無紀錄',
    empty: '還沒有練習紀錄，先去練幾題吧。',
    compact: '正確率 {pct}%（{passed}/{total}）',
    title: '正確率 {pct}%',
    detail: '{passed} / {total} 題答對',
  },
  batchPractice: {
    button: '練習全部到期（{count} 條路線）',
  },
  masteryTrend: {
    empty: '開始練習後，這裡會出現你的精熟度進步曲線。',
    aria: '精熟度趨勢：最高 {max} 張精熟，共 {days} 天紀錄',
    pointTitle: '{date}：{count} 張精熟',
  },
  reviewReminder: {
    allDone: '今天的複習都完成了 🎉',
    due: '你有 {count} 張卡片待複習',
    start: '開始複習',
  },
  dashboard: {
    loadError: '無法載入複習清單：{message}',
    empty: '尚未報名任何路線，先到下方選一條開始。',
    routeLabel: '路線 {routeId}',
    due: '{count} 待複習',
    noDue: '無到期',
    newCards: '{count} 新卡',
    nextReview: '下次複習 {time}',
    masteryLabel: '精熟度',
    start: '開始複習',
  },
  variant: {
    enrollFailed: '報名失敗',
    loadError: '無法載入路線變化：{message}',
    empty: '這條路線目前沒有可練習的 variant。',
    stopsTrips: '{stops} 站 · {trips} 班次',
    startPractice: '開始練習',
    enrolling: '報名中…',
    enroll: '報名',
    enrollError: '報名失敗：{message}',
  },
  routeDetail: {
    back: '← 回路線列表',
    title: '路線 {routeId}',
    subtitle: '選一個方向／終點報名，開始練習。',
  },
  recall: {
    batchProgress: '批次練習 {current} / {total}',
    allDone: '全部完成 🎉',
    nextRoute: '下一條路線（{current} / {total}）',
  },
};

export const messages: Record<Locale, Messages> = {
  en,
  'zh-TW': zhTW,
};
