const fs = require('fs');
const path = require('path');

// channels.json 읽기
const channelsPath = path.join(__dirname, '..', 'data', 'channels.json');
const data = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
const channels = data.channels || data;

// 요약 데이터 생성
const summary = {
    lastUpdated: new Date().toISOString(),
    totalChannels: channels.length,
    totalVideos: 0,
    totalShorts: 0,
    totalViews: channels.reduce((sum, ch) => sum + (parseInt(ch.viewCount) || 0), 0),
    totalSubscribers: channels.reduce((sum, ch) => sum + (parseInt(ch.subscriberCount) || 0), 0),
    channelStats: channels.map(ch => ({
        id: ch.id,
        title: ch.title,
        thumbnail: ch.thumbnail,
        subscriberCount: parseInt(ch.subscriberCount) || 0,
        viewCount: parseInt(ch.viewCount) || 0,
        viewCountChange: 0,  // 다음 실행 시 계산
        changePercent: 0
    })).sort((a, b) => b.subscriberCount - a.subscriberCount)  // 구독자순 정렬
};

// summary.json 저장
const summaryPath = path.join(__dirname, '..', 'data', 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

// latest.json 저장 (대시보드용)
const latestPath = path.join(__dirname, '..', 'data', 'latest.json');
fs.writeFileSync(latestPath, JSON.stringify({
    ...summary,
    channels: summary.channelStats.slice(0, 50)  // 상위 50개만
}, null, 2));

console.log('✅ 요약 파일 생성 완료!');
console.log(`📊 총 ${channels.length}개 채널`);
console.log(`👥 총 구독자: ${summary.totalSubscribers.toLocaleString()}`);
console.log(`👁️ 총 조회수: ${summary.totalViews.toLocaleString()}`);