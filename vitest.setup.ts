import '@testing-library/jest-dom';

// Change 49: 認證限流在測試預設關閉（避免各測試共用 IP 互相卡住）；限流測試自行打開。
process.env.RATE_LIMIT_DISABLED = '1';
