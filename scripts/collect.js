const axios = require('axios');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class YouTubeDataCollector {
  constructor() {
    // API 키 로테이션
    this.apiKeys = [
      process.env.YOUTUBE_API_KEY1,
      process.env.YOUTUBE_API_KEY2,
      process.env.YOUTUBE_API_KEY3
    ].filter(key => key); // 유효한 키만 사용
    
    this.currentKeyIndex = 0;
    this.quotaUsed = 0;
    this.collectionType = this.getCollectionType();
    this.timestamp = new Date().toISOString();
    
    // 데이터 경로
    this.dataDir = path.join(__dirname, '..', 'data');
    this.configDir = path.join(__dirname, '..', 'config');
    
    // 디렉토리 생성
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  getCollectionType() {
    const args = process.argv.slice(2);
    const typeArg = args.find(arg => arg.startsWith('--type='));
    
    if (typeArg) {
      return typeArg.split('=')[1];
    }
    
    const hour = new Date().getHours();
    return hour < 12 ? 'morning' : 'night';
  }

  getNextApiKey() {
    if (this.apiKeys.length === 0) {
      console.warn('⚠️ API 키가 없습니다. RSS만 사용합니다.');
      return null;
    }
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  async loadChannels() {
    const channelsPath = path.join(this.configDir, 'channels.json');
    try {
      const data = fs.readFileSync(channelsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('채널 목록 로드 실패:', error.message);
      // 기본 채널 목록
      return ['UChT_3672e3gi9TzLUCpv'];
    }
  }

  // RSS 피드로 최신 동영상 수집
  async fetchRSSFeed(channelId) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      if (!result.feed || !result.feed.entry) {
        return [];
      }
      
      const videos = result.feed.entry.slice(0, 15).map(entry => {
        const videoId = entry['yt:videoId'][0];
        const stats = entry['media:group'][0]['media:community'][0]['media:statistics'][0].$;
        
        return {
          videoId,
          channelId,
          title: entry.title[0],
          published: entry.published[0],
          updated: entry.updated[0],
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          views: parseInt(stats.views || 0),
          description: entry['media:group'][0]['media:description'][0] || ''
        };
      });
      
      return videos;
    } catch (error) {
      console.error(`RSS 에러 ${channelId}:`, error.message);
      return [];
    }
  }

  // YouTube API로 채널 정보 수집
  async fetchChannelStats(channelIds) {
    const apiKey = this.getNextApiKey();
    if (!apiKey) return [];
    
    const chunks = this.chunkArray(channelIds, 50);
    const allChannels = [];
    
    for (const chunk of chunks) {
      try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: {
            key: apiKey,
            id: chunk.join(','),
            part: 'snippet,statistics,contentDetails',
            maxResults: 50
          }
        });
        
        this.quotaUsed += 1;
        
        if (response.data.items) {
          const channels = response.data.items.map(item => ({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            customUrl: item.snippet.customUrl,
            publishedAt: item.snippet.publishedAt,
            thumbnail: item.snippet.thumbnails.medium.url,
            viewCount: parseInt(item.statistics.viewCount || 0),
            subscriberCount: parseInt(item.statistics.subscriberCount || 0),
            videoCount: parseInt(item.statistics.videoCount || 0),
            uploadsPlaylist: item.contentDetails.relatedPlaylists.uploads,
            lastFetched: this.timestamp
          }));
          
          allChannels.push(...channels);
        }
      } catch (error) {
        console.error('API 에러:', error.message);
      }
      
      // API 제한 대응
      await this.delay(1000);
    }
    
    return allChannels;
  }

  // 비디오 상세 정보 수집
  async fetchVideoDetails(videoIds) {
    const apiKey = this.getNextApiKey();
    if (!apiKey || videoIds.length === 0) return [];
    
    const chunks = this.chunkArray(videoIds, 50);
    const allVideos = [];
    
    for (const chunk of chunks) {
      try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            key: apiKey,
            id: chunk.join(','),
            part: 'statistics,contentDetails',
            maxResults: 50
          }
        });
        
        this.quotaUsed += 1;
        
        if (response.data.items) {
          const videos = response.data.items.map(item => ({
            videoId: item.id,
            duration: this.parseDuration(item.contentDetails.duration),
            viewCount: parseInt(item.statistics.viewCount || 0),
            likeCount: parseInt(item.statistics.likeCount || 0),
            commentCount: parseInt(item.statistics.commentCount || 0),
            lastFetched: this.timestamp
          }));
          
          allVideos.push(...videos);
        }
      } catch (error) {
        console.error('Video API 에러:', error.message);
      }
      
      await this.delay(1000);
    }
    
    return allVideos;
  }

  // 메인 수집 실행
  async execute() {
    console.log(`\n🚀 ${this.collectionType.toUpperCase()} 수집 시작: ${this.timestamp}`);
    console.log(`📝 사용 가능한 API 키: ${this.apiKeys.length}개\n`);
    
    const channels = await this.loadChannels();
    console.log(`📺 수집 대상 채널: ${channels.length}개`);
    
    const collectedData = {
      timestamp: this.timestamp,
      type: this.collectionType,
      channels: [],
      videos: [],
      statistics: {
        totalChannels: 0,
        totalVideos: 0,
        quotaUsed: 0
      }
    };
    
    // 오전 수집 (가벼운 수집)
    if (this.collectionType === 'morning') {
      console.log('🌅 오전 수집 모드: RSS 중심 + 상위 채널 API');
      
      // 1. 모든 채널 RSS 수집
      for (let i = 0; i < channels.length; i++) {
        const videos = await this.fetchRSSFeed(channels[i]);
        collectedData.videos.push(...videos);
        
        if ((i + 1) % 10 === 0) {
          console.log(`  RSS 진행: ${i + 1}/${channels.length}`);
        }
        
        await this.delay(100);
      }
      
      // 2. 상위 30개 채널만 API 상세 정보
      const topChannels = channels.slice(0, 30);
      const channelStats = await this.fetchChannelStats(topChannels);
      collectedData.channels = channelStats;
      
    } 
    // 오후 수집 (전체 상세 수집)
    else {
      console.log('🌙 야간 수집 모드: 전체 상세 분석');
      
      // 1. 모든 채널 API 정보
      const channelStats = await this.fetchChannelStats(channels);
      collectedData.channels = channelStats;
      
      // 2. RSS로 최신 동영상
      for (let i = 0; i < channels.length; i++) {
        const videos = await this.fetchRSSFeed(channels[i]);
        collectedData.videos.push(...videos);
        
        if ((i + 1) % 10 === 0) {
          console.log(`  RSS 진행: ${i + 1}/${channels.length}`);
        }
        
        await this.delay(100);
      }
      
      // 3. 오늘 업로드된 영상 상세 정보
      const today = new Date().toISOString().split('T')[0];
      const todayVideos = collectedData.videos.filter(v => 
        v.published.startsWith(today)
      );
      
      if (todayVideos.length > 0) {
        console.log(`📊 오늘 업로드 영상 ${todayVideos.length}개 상세 수집`);
        const videoIds = todayVideos.map(v => v.videoId);
        const videoDetails = await this.fetchVideoDetails(videoIds);
        
        // 상세 정보 병합
        collectedData.videos = collectedData.videos.map(v => {
          const detail = videoDetails.find(d => d.videoId === v.videoId);
          return detail ? { ...v, ...detail } : v;
        });
      }
    }
    
    // 통계 업데이트
    collectedData.statistics = {
      totalChannels: collectedData.channels.length,
      totalVideos: collectedData.videos.length,
      quotaUsed: this.quotaUsed,
      timestamp: this.timestamp
    };
    
    // 데이터 저장
    await this.saveData(collectedData);
    
    console.log('\n✅ 수집 완료!');
    console.log(`📊 통계:`);
    console.log(`  - 채널: ${collectedData.statistics.totalChannels}개`);
    console.log(`  - 동영상: ${collectedData.statistics.totalVideos}개`);
    console.log(`  - API 사용량: ${this.quotaUsed} 유닛\n`);
  }

  // 데이터 저장
  async saveData(data) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${this.collectionType}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    // 개별 파일 저장
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 데이터 저장: ${filename}`);
    
    // latest 파일 업데이트
    const latestPath = path.join(this.dataDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
    
    // 요약 생성
    const summary = {
      date,
      type: this.collectionType,
      stats: {
        channels: data.statistics.totalChannels,
        videos: data.statistics.totalVideos,
        apiUsage: data.statistics.quotaUsed
      }
    };
    
    const summaryPath = path.join(this.dataDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  }

  // 유틸리티 함수들
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

  parseDuration(duration) {
    // PT15M33S -> 933 (seconds)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
  }
}

// 실행
if (require.main === module) {
  const collector = new YouTubeDataCollector();
  collector.execute().catch(error => {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  });
}

module.exports = YouTubeDataCollector;