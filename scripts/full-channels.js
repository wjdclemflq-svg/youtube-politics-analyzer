const channels = require('../data/channel-history.json');
const fs = require('fs');

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