const fs = require('fs');

// channel-history.json 파일 읽기
const rawData = fs.readFileSync('./data/channel-history.json', 'utf8');
const channelData = JSON.parse(rawData);

// 객체를 배열로 변환
const channels = Object.keys(channelData).map(channelId => ({
  id: channelId,
  title: channelId, // 일단 채널 ID를 제목으로 사용
  viewCount: channelData[channelId].viewCount,
  subscriberCount: channelData[channelId].subscriberCount,
  thumbnail: `https://picsum.photos/seed/${channelId}/60/40` // 임시 썸네일
}));

console.log(`📊 총 ${channels.length}개 채널 발견`);

const output = {
  timestamp: new Date().toISOString(),
  channels: channels,
  videos: [],
  statistics: {
    totalChannels: channels.length,
    totalVideos: 0,
    quotaUsed: 10
  }
};

fs.writeFileSync('./data/channels.json', JSON.stringify(output, null, 2));
console.log(`✅ ${channels.length}개 채널 데이터 저장 완료`);