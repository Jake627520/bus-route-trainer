# ui Specification

## Purpose
TBD - created by archiving change 34-visual-polish. Update Purpose after archive.

## Requirements

### Requirement: 一致的品牌視覺
系統 SHALL 以 **Translink 官方配色**呈現：深藍 #242B4C 為主色（按鈕/文字/徽章/進度條），洋紅 #EF60A3 為點綴（少量 pop）。

#### Scenario: 主要操作按鈕為品牌藍
- **WHEN** 顯示主要 CTA（開始練習/複習/登入）
- **THEN** 以 Translink 深藍 #242B4C 底白字呈現（AAA 對比）

#### Scenario: 深色模式
- **WHEN** 系統為深色模式
- **THEN** 深藍黑紙感底 #0e1326，品牌與粉紅改用較亮階

#### Scenario: 粉紅點綴
- **WHEN** 顯示 streak 連續天數、批次練習 hero、作用中語言
- **THEN** 以 Translink 洋紅呈現；承白字處用深粉 #C42D7B（AA）

### Requirement: 載入骨架
系統 SHALL 以骨架佔位（而非純文字）呈現清單類元件的載入狀態，並維持 `role="status"` 無障礙語意。

#### Scenario: 清單載入中
- **WHEN** review 儀表板 / 路線列表 / variant 列表資料尚未返回
- **THEN** 顯示與內容等高的 shimmer 骨架卡；reduced-motion 時關閉動畫

### Requirement: 首頁深色 feature 錨點
系統 SHALL 在首頁提供一塊深色漸層卡作為視覺焦點，彙總今日待複習數與連續天數，到期時提供「立即複習」入口。

#### Scenario: 有到期
- **WHEN** 今日有到期卡片
- **THEN** 錨點顯示到期數與「立即複習」deep-link（連到最該複習的 variant）

#### Scenario: 無到期
- **WHEN** 今日無到期
- **THEN** 錨點顯示「已全部複習完」鼓勵訊息

### Requirement: 共用 review summary
系統 SHALL 讓同一頁多個需要 review summary 的元件共用一次 `GET /api/review/summary`（透過 Provider），且元件在無 Provider 時可自行取用（fallback）。

#### Scenario: 首頁單次抓取
- **WHEN** 首頁同時渲染 HomeHero / ReviewReminder / BatchPracticeButton / ReviewDashboard
- **THEN** 僅觸發一次 `/api/review/summary`，各元件共用結果

#### Scenario: 獨立使用 fallback
- **WHEN** 元件在沒有 Provider 的情境被渲染（如獨立測試）
- **THEN** 該元件自行抓取 summary，行為與過去一致

### Requirement: 共用 practice streak
系統 SHALL 讓同一頁多個需要 streak 的元件共用一次 `GET /api/review/streak`（透過 Provider），且元件在無 Provider 時可自行取用（fallback）。

#### Scenario: 首頁單次抓取
- **WHEN** 首頁同時渲染 HomeHero 與 StreakStat
- **THEN** 僅觸發一次 `/api/review/streak`，兩者共用結果

#### Scenario: 獨立使用 fallback
- **WHEN** 元件在沒有 Provider 的情境被渲染
- **THEN** 該元件自行抓取 streak，行為與過去一致

### Requirement: 路線模式篩選與標示
系統 SHALL 在路線列表以模式（公車/火車/渡輪）標示每條路線，並在資料含多種模式時提供模式篩選。

#### Scenario: 多模式篩選
- **WHEN** 路線資料含多種 route_type
- **THEN** 顯示「全部/公車/火車/渡輪」篩選，選某模式只列該模式路線；每條路線顯示其模式標籤（色彩區分）

#### Scenario: 單一模式不顯示篩選
- **WHEN** 資料只有單一模式
- **THEN** 不顯示模式篩選列（避免無意義分頁）


### Requirement: 快捷鍵不得搶走元件自己的操作
練習頁「回饋」畫面的 Enter / Space 快捷鍵 SHALL 只在焦點位於頁面本體時進下一題；焦點在按鈕、連結、輸入框等可操作元素時 MUST NOT 攔截；帶 Ctrl/Alt/Meta/Shift 的組合鍵一律忽略。

#### Scenario: 焦點在「放棄」按鈕
- **WHEN** 回饋畫面中焦點在「放棄」按鈕並按 Enter
- **THEN** 執行放棄，而不是進下一題

### Requirement: 對話框焦點管理
Modal SHALL 在開啟時把焦點移進對話框、將 Tab / Shift+Tab 圈限在對話框內、關閉後還原到開啟前的元素；父元件重新 render 時不得重新搶焦點。

### Requirement: 螢幕閱讀器播報
練習頁 SHALL 有常駐的 `role="status"` 播報區，在答題後念出答對／答錯與（答錯時的）正確答案；題目提示 SHALL 以 `aria-describedby` 關聯輸入框，且提示中的底線讀成「空格／blank」；回饋畫面 SHALL 把焦點移到「下一題」按鈕；錯誤區塊 SHALL 為 `role="alert"`；裝飾 emoji SHALL `aria-hidden`。

### Requirement: 鍵盤導覽輔助
系統 SHALL 提供「跳到主要內容」連結（各頁 `<main id="main-content">`）、全域 `:focus-visible` 焦點樣式（深色模式使用高對比顏色）、不重複的表單控制項 id、帶 `lang` 的語言切換按鈕。
