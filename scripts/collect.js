const axios = require('axios');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class OptimizedYouTubeCollector {
  constructor() {
    this.apiKeys = [
      process.env.YOUTUBE_API_KEY1,
      process.env.YOUTUBE_API_KEY2,
      process.env.YOUTUBE_API_KEY3
    ].filter(k => k);
    
    this.currentKeyIndex = 0;
    this.quotaUsed = 0;
    this.maxQuota = 30000;
    this.mode = this.getCollectionMode();
    
    this.dataDir = path.join(__dirname, '..', 'data');
    this.configDir = path.join(__dirname, '..', 'config');
    this.cacheDir = path.join(this.dataDir, 'cache');
    
    [this.dataDir, this.cacheDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  getCollectionMode() {
    const args = process.argv.slice(2);
    const modeArg = args.find(arg => arg.startsWith('--mode='));
    if (modeArg) return modeArg.split('=')[1];
    
    const hour = new Date().getHours();
    return hour < 12 ? 'light' : 'smart';
  }

  getApiKey() {
    if (this.apiKeys.length === 0) return null;
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  async loadChannels() {
    const channelsPath = path.join(this.configDir, 'channels.json');
    try {
      const data = fs.readFileSync(channelsPath, 'utf8');
      const channels = JSON.parse(data);
      
      // 티어 자동 분류
      return {
        tier1: channels.slice(0, 50),
        tier2: channels.slice(50, 200),
        tier3: channels.slice(200, 500)
      };
    } catch (error) {
      console.error('채널 목록 로드 실패:', error.message);
      return { tier1: [], tier2: [], tier3: [] };
    }
  }

  async fetchRSSFeed(channelId) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      if (!result.feed || !result.feed.entry) {
        return { channelId, videos: [], success: false };
      }
      
      const videos = result.feed.entry.slice(0, 50).map(entry => {
        const videoId = entry['yt:videoId'][0];
        const stats = entry['media:group'][0]['media:community']?.[0]['media:statistics']?.[0]?.$ || {};
        
        return {
          videoId,
          channelId,
          title: entry.title[0],
          published: entry.published[0],
          views: parseInt(stats.views || 0),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          description: entry['media:group'][0]['media:description']?.[0]?.substring(0, 200) || ''
        };
      });
      
      return {
        channelId,
        videos,
        success: true,
        lastVideoDate: videos[0]?.published || null
      };
    } catch (error) {
      return { channelId, videos: [], success: false };
    }
  }

  async fetchChannelsBatch(channelIds) {
    if (!this.apiKeys.length || channelIds.length === 0) return [];
    
    const results = [];
    const batches = this.chunkArray(channelIds, 50);
    
    for (const batch of batches) {
      const apiKey = this.getApiKey();
      if (!apiKey || this.quotaUsed >= this.maxQuota * 0.9) break;
      
      try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: {
            key: apiKey,
            id: batch.join(','),
            part: 'snippet,statistics',
            maxResults: 50
          }
        });
        
        this.quotaUsed += 1;
        
        const channels = response.data.items.map(item => ({
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description?.substring(0, 200),
          thumbnail: item.snippet.thumbnails.medium.url,
          viewCount: parseInt(item.statistics.viewCount || 0),
          subscriberCount: parseInt(item.statistics.subscriberCount || 0),
          videoCount: parseInt(item.statistics.videoCount || 0),
          fetchedAt: new Date().toISOString()
        }));
        
        results.push(...channels);
      } catch (error) {
        console.error('API 에러:', error.message);
      }
      
      await this.delay(200);
    }
    
    return results;
  }

  async execute() {
    console.log(`🚀 수집 시작 - 모드: ${this.mode}, API 키: ${this.apiKeys.length}개`);
    const startTime = Date.now();
    
    const channelConfig = await this.loadChannels();
    let targetChannels = [];
    
    // 모드별 채널 선택
    if (this.mode === 'full') {
      targetChannels = [...channelConfig.tier1, ...channelConfig.tier2, ...channelConfig.tier3];
    } else if (this.mode === 'light') {
      targetChannels = channelConfig.tier1;
    } else {
      targetChannels = [...channelConfig.tier1, ...channelConfig.tier2.slice(0, 50)];
    }
    
    console.log(`📊 대상 채널: ${targetChannels.length}개`);
    
    const collectedData = {
      timestamp: new Date().toISOString(),
      mode: this.mode,
      channels: [],
      videos: [],
      statistics: {
        targetChannels: targetChannels.length,
        successChannels: 0,
        totalVideos: 0,
        quotaUsed: 0
      }
    };
    
    // RSS 수집
    console.log('📡 RSS 수집 중...');
    for (let i = 0; i < targetChannels.length; i++) {
      const result = await this.fetchRSSFeed(targetChannels[i]);
      if (result.success) {
        collectedData.videos.push(...result.videos);
        collectedData.statistics.successChannels++;
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`  진행: ${i + 1}/${targetChannels.length}`);
      }
      
      await this.delay(100);
    }
    
    // API로 채널 정보 수집 (필요시)
    if (this.apiKeys.length > 0 && this.mode !== 'light') {
      const apiChannels = await this.fetchChannelsBatch(targetChannels.slice(0, 100));
      collectedData.channels = apiChannels;
    }
    
    // 통계 업데이트
    collectedData.statistics.totalVideos = collectedData.videos.length;
    collectedData.statistics.quotaUsed = this.quotaUsed;
    
    // 저장
    await this.saveData(collectedData);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ 완료! 채널: ${collectedData.statistics.successChannels}, 영상: ${collectedData.videos.length}, 시간: ${duration}초`);
  }

  async saveData(data) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${this.mode}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(this.dataDir, 'latest.json'), JSON.stringify(data, null, 2));
    
    console.log(`💾 저장: ${filename}`);
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (require.main === module) {
  const collector = new OptimizedYouTubeCollector();
  collector.execute().catch(console.error);
}

module.exports = OptimizedYouTubeCollector;
