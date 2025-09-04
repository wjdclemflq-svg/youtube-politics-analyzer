require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY_1
});

async function getAllChannelInfo() {
  try {
    // channel-history.json 읽기
    const historyData = JSON.parse(fs.readFileSync('./data/channel-history.json', 'utf8'));
    const channelIds = Object.keys(historyData);
    
    console.log(`📊 총 ${channelIds.length}개 채널 정보 수집 시작...`);
    
    const allChannels = [];
    
    // 50개씩 나눠서 처리 (YouTube API는 한번에 50개까지)
    for (let i = 0; i < channelIds.length; i += 50) {
      const batch = channelIds.slice(i, i + 50);
      
      const response = await youtube.channels.list({
        part: 'snippet,statistics',
        id: batch.join(','),
        maxResults: 50
      });
      
      response.data.items.forEach(channel => {
        allChannels.push({
          id: channel.id,
          title: channel.snippet.title,
          thumbnail: channel.snippet.thumbnails.default.url,
          subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
          viewCount: parseInt(channel.statistics.viewCount) || 0
        });
      });
      
      console.log(`✅ ${Math.min(i + 50, channelIds.length)}/${channelIds.length} 완료`);
    }
    
    // 결과 저장
    const output = {
      timestamp: new Date().toISOString(),
      channels: allChannels,
      videos: [],
      statistics: {
        totalChannels: allChannels.length,
        totalVideos: 0,
        quotaUsed: Math.ceil(channelIds.length / 50) * 1
      }
    };
    
    fs.writeFileSync('./data/channels.json', JSON.stringify(output, null, 2));
    console.log(`💾 ${allChannels.length}개 채널 정보 저장 완료!`);
    
  } catch (error) {
    console.error('❌ 에러:', error.message);
  }
}

getAllChannelInfo();