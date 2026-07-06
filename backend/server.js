const express = require('express');
const path = require('path');
const { PORT } = require('./config');
const router = require('./routes');

const app = express();

// 프론트엔드 정적 파일 서빙
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API 라우트
app.use('/api', router);

// 그 외 모든 경로 → index.html (SPA 대응)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// 직접 실행(npm start)일 때만 리슨 — Vercel 서버리스에선 export만 사용
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`서울 전월세 탐색기 서버 실행 중: http://localhost:${PORT}`);
  });
}

module.exports = app;
