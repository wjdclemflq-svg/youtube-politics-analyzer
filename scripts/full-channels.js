const fs = require('fs');

// 두 파일 모두 읽기
const historyData = JSON.parse(fs.readFileSync('./data/channel-history.json', 'utf8'));
const tempData = JSON.parse(fs.readFileSync('./data/channels-temp.json', 'utf8'));

// tempData를 ID 기준으로 맵 생성
const tempMap = {};
if (tempData.channels) {
  tempData.channels.forEach(ch => {
    tempMap[ch.id] = ch;
  });
}

// 합친 데이터 생성
const channels = Object.keys(historyData).map(channelId => ({
  id: channelId,
  title: tempMap[channelId]?.title || channelId,
  thumbnail: tempMap[channelId]?.thumbnail || `https://picsum.photos/seed/${channelId}/60/40`,
  viewCount: historyData[channelId].viewCount,
  subscriberCount: historyData[channelId].subscriberCount
}));

console.log(`📊 총 ${channels.length}개 채널 처리 완료`);
console.log(`✅ ${Object.keys(tempMap).length}개 채널 이름/썸네일 매칭`);

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
console.log(`💾 channels.json 저장 완료`);