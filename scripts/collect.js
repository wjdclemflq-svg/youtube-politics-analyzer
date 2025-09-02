// optimized-collect.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class OptimizedYouTubeCollector {
  constructor() {
    // API 키 풀 관리
    this.apiKeys = [
      process.env.YOUTUBE_API_KEY1,
      process.env.YOUTUBE_API_KEY2,
      process.env.YOUTUBE_API_KEY3
    ].filter(key => key);
    
    // 할당량 추적
    this.quotaLimits = { key1: 10000, key2: 10000, key3: 10000 };
    this.quotaUsed = { key1: 0, key2: 0, key3: 0 };
    
    // 수집 설정
    this.collectionType = this.determineCollectionType();
    this.timestamp = new Date().toISOString();
    this.hour = new Date().getHours();
    
    // 경로 설정
    this.dataDir = path.join(__dirname, '..', 'data');
    this.configDir = path.join(__dirname, '..', 'config');
    this.cacheDir = path.join(this.dataDir, 'cache');
    
    // 디렉토리 생성
    [this.dataDir, this.cacheDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    
    // 캐시 로드
    this.cache = this.loadCache();
  }

  determineCollectionType() {
    const hour = new Date().getHours();
    const types = {
      7: 'morning_rss',     // RSS만
      11: 'noon_light',     // 상위 20개
      15: 'afternoon_rss',  // RSS만
      19: 'evening_medium', // 상위 50개
      23: 'night_full',     // 전체 수집
      3: 'dawn_rss'         // RSS만
    };
    
    return types[hour] || 'manual';
  }

  // 최적 API 키 선택
  getOptimalKey() {
    const available = Object.entries(this.quotaUsed)
      .map(([key, used], idx) => ({
        key: this.apiKeys[idx],
        idx: idx,
        remaining: this.quotaLimits[`key${idx + 1}`] - used
      }))
      .filter(k => k.key && k.remaining > 100)
      .sort((a, b) => b.remaining - a.remaining);
    
    if (available.length === 0) {
      console.warn('⚠️ 모든 API 키 할당량 소진!');
      return null;
    }
    
    const selected = available[0];
    console.log(`🔑 API 키 ${selected.idx + 1} 선택 (남은 할당량: ${selected.remaining})`);
    return selected.key;
  }

  // 캐시 관리
  loadCache() {
    const cachePath = path.join(this.cacheDir, 'channel-cache.json');
    if (fs.existsSync(cachePath)) {
      try {
        return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      } catch (e) {
        console.error('캐시 로드 실패:', e.message);
      }
    }
    return {};
  }

  saveCache() {
    const cachePath = path.join(this.cacheDir, 'channel-cache.json');
    fs.writeFileSync(cachePath, JSON.stringify(this.cache, null, 2));
  }

  shouldUpdateChannel(channelId, tier) {
    const cached = this.cache[channelId];
    if (!cached) return true;
    
    const hoursSince = (Date.now() - new Date(cached.lastFetched)) / (1000 * 60 * 60);
    
    // 계층별 업데이트 주기
    const updateHours = {
      tier1: 4,   // 4시간마다
      tier2: 12,  // 12시간마다
      tier3: 24   // 24시간마다
    };
    
    return hoursSince >= updateHours[tier];
  }

  // 채널 계층 분류
async loadTieredChannels() {
  const channelsPath = path.join(this.configDir, 'channels.json');
  
  try {
    const data = fs.readFileSync(channelsPath, 'utf8');
    const parsed = JSON.parse(data);
    
    // 이미 계층 구조인 경우
    if (parsed.tier1) {
      return parsed;
    }
    
    // 배열인 경우 자동 분할 (loadChannels 호출 없이)
    if (Array.isArray(parsed)) {
      return {
        tier1: parsed.slice(0, 20),
        tier2: parsed.slice(20, 50),
        tier3: parsed.slice(50)
      };
    }
  } catch (error) {
    console.error('채널 로드 실패:', error.message);
  }
  
  // 기본값
  return {
    tier1: ['UChT_3672e3gi9TzLUCpv'],
    tier2: [],
    tier3: []
  };
}

  // RSS 최적화 수집
  async fetchRSSBatch(channelIds) {
    console.log(`📡 RSS 배치 수집: ${channelIds.length}개 채널`);
    const results = [];
    
    // 병렬 처리 (10개씩)
    for (let i = 0; i < channelIds.length; i += 10) {
      const batch = channelIds.slice(i, i + 10);
      const promises = batch.map(id => this.fetchRSSFeed(id));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults.flat());
      
      if ((i + 10) % 50 === 0) {
        console.log(`  진행: ${Math.min(i + 10, channelIds.length)}/${channelIds.length}`);
      }
    }
    
    return results;
  }

  async fetchRSSFeed(channelId) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const response = await axios.get(url, { timeout: 3000 });
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      if (!result.feed || !result.feed.entry) return [];
      
      return result.feed.entry.slice(0, 15).map(entry => {
        const videoId = entry['yt:videoId'][0];
        const stats = entry['media:group'][0]['media:community'][0]['media:statistics'][0].$;
        
        return {
          videoId,
          channelId,
          title: entry.title[0],
          published: entry.published[0],
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          views: parseInt(stats.views || 0),
          description: (entry['media:group'][0]['media:description'][0] || '').substring(0, 200)
        };
      });
    } catch (error) {
      // 에러 무시하고 계속
      return [];
    }
  }

  // API 최적화 수집
  async fetchChannelsBatch(channelIds, useCache = true) {
    const apiKey = this.getOptimalKey();
    if (!apiKey) return [];
    
    // 캐시 확인
    const toFetch = useCache 
      ? channelIds.filter(id => this.shouldUpdateChannel(id, 'tier1'))
      : channelIds;
    
    if (toFetch.length === 0) {
      console.log('✨ 모든 채널 캐시 유효');
      return channelIds.map(id => this.cache[id]).filter(Boolean);
    }
    
    console.log(`📊 API로 ${toFetch.length}개 채널 정보 수집`);
    const chunks = this.chunkArray(toFetch, 50);
    const results = [];
    
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
        
        this.quotaUsed[`key${this.apiKeys.indexOf(apiKey) + 1}`] += 1;
        
        if (response.data.items) {
          const channels = response.data.items.map(item => {
            const channel = {
              id: item.id,
              title: item.snippet.title,
              description: item.snippet.description?.substring(0, 200),
              customUrl: item.snippet.customUrl,
              thumbnail: item.snippet.thumbnails.medium.url,
              viewCount: parseInt(item.statistics.viewCount || 0),
              subscriberCount: parseInt(item.statistics.subscriberCount || 0),
              videoCount: parseInt(item.statistics.videoCount || 0),
              lastFetched: this.timestamp
            };
            
            // 캐시 업데이트
            this.cache[channel.id] = channel;
            return channel;
          });
          
          results.push(...channels);
        }
      } catch (error) {
        console.error('API 오류:', error.message);
      }
      
      await this.delay(500); // API 제한 대응
    }
    
    // 캐시된 데이터 추가
    const cached = channelIds
      .filter(id => !toFetch.includes(id))
      .map(id => this.cache[id])
      .filter(Boolean);
    
    return [...results, ...cached];
  }

  // 메인 실행 로직
  async execute() {
    console.log(`\n🚀 최적화 수집 시작: ${this.collectionType}`);
    console.log(`⏰ 시간: ${this.timestamp}`);
    console.log(`🔑 사용 가능 API 키: ${this.apiKeys.length}개\n`);
    
    const tieredChannels = await this.loadTieredChannels();
    const collectedData = {
      timestamp: this.timestamp,
      type: this.collectionType,
      channels: [],
      videos: [],
      statistics: {
        totalChannels: 0,
        totalVideos: 0,
        quotaUsed: 0,
        cacheHits: 0
      }
    };
    
    // 수집 타입별 실행
    switch(this.collectionType) {
      case 'morning_rss':
      case 'afternoon_rss':
      case 'dawn_rss':
        // RSS만 수집
        console.log('📡 RSS 전용 모드');
        const allChannels = [...tieredChannels.tier1, ...tieredChannels.tier2, ...tieredChannels.tier3];
        collectedData.videos = await this.fetchRSSBatch(allChannels);
        break;
        
      case 'noon_light':
        // 상위 20개 채널
        console.log('🌅 가벼운 수집 모드 (Tier 1)');
        collectedData.channels = await this.fetchChannelsBatch(tieredChannels.tier1);
        collectedData.videos = await this.fetchRSSBatch(tieredChannels.tier1);
        break;
        
      case 'evening_medium':
        // 상위 50개 채널
        console.log('🌇 중간 수집 모드 (Tier 1+2)');
        const mediumChannels = [...tieredChannels.tier1, ...tieredChannels.tier2];
        collectedData.channels = await this.fetchChannelsBatch(mediumChannels);
        collectedData.videos = await this.fetchRSSBatch(mediumChannels);
        break;
        
      case 'night_full':
        // 전체 수집
        console.log('🌙 전체 수집 모드 (모든 Tier)');
        const allTiers = [...tieredChannels.tier1, ...tieredChannels.tier2, ...tieredChannels.tier3];
        
        // Tier별 차등 수집
        const tier1Data = await this.fetchChannelsBatch(tieredChannels.tier1, false); // 캐시 무시
        const tier2Data = await this.fetchChannelsBatch(tieredChannels.tier2, true);  // 캐시 사용
        const tier3Data = await this.fetchChannelsBatch(tieredChannels.tier3, true);  // 캐시 사용
        
        collectedData.channels = [...tier1Data, ...tier2Data, ...tier3Data];
        collectedData.videos = await this.fetchRSSBatch(allTiers);
        
        // 인기 동영상 상세 수집
        await this.collectTrendingDetails(collectedData);
        break;
        
    default:
  // 수동 실행
  console.log('🔧 수동 실행 모드');
  // loadChannels 대신 tieredChannels 사용
  const allChannels = [...tieredChannels.tier1, ...tieredChannels.tier2, ...tieredChannels.tier3];
  collectedData.channels = await this.fetchChannelsBatch(allChannels.slice(0, 50));
  collectedData.videos = await this.fetchRSSBatch(allChannels);
    
    // 통계 업데이트
    collectedData.statistics = {
      totalChannels: collectedData.channels.length,
      totalVideos: collectedData.videos.length,
      quotaUsed: Object.values(this.quotaUsed).reduce((a, b) => a + b, 0),
      cacheHits: Object.keys(this.cache).length
    };
    
    // 데이터 저장
    await this.saveData(collectedData);
    this.saveCache();
    
    console.log('\n✅ 수집 완료!');
    console.log(`📊 통계:`);
    console.log(`  - 채널: ${collectedData.statistics.totalChannels}개`);
    console.log(`  - 동영상: ${collectedData.statistics.totalVideos}개`);
    console.log(`  - API 사용량: ${collectedData.statistics.quotaUsed} 유닛`);
    console.log(`  - 캐시 적중: ${collectedData.statistics.cacheHits}개\n`);
    
    // 할당량 경고
    this.checkQuotaWarnings();
  }

  // 인기 동영상 상세 수집
  async collectTrendingDetails(data) {
    const apiKey = this.getOptimalKey();
    if (!apiKey) return;
    
    // 조회수 상위 100개 동영상
    const topVideos = data.videos
      .sort((a, b) => b.views - a.views)
      .slice(0, 100)
      .map(v => v.videoId);
    
    if (topVideos.length === 0) return;
    
    console.log(`🔥 인기 동영상 ${topVideos.length}개 상세 수집`);
    
    const chunks = this.chunkArray(topVideos, 50);
    const details = [];
    
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
        
        this.quotaUsed[`key${this.apiKeys.indexOf(apiKey) + 1}`] += 1;
        
        if (response.data.items) {
          details.push(...response.data.items.map(item => ({
            videoId: item.id,
            duration: this.parseDuration(item.contentDetails.duration),
            viewCount: parseInt(item.statistics.viewCount || 0),
            likeCount: parseInt(item.statistics.likeCount || 0),
            commentCount: parseInt(item.statistics.commentCount || 0)
          })));
        }
      } catch (error) {
        console.error('동영상 상세 수집 오류:', error.message);
      }
    }
    
    // 상세 정보 병합
    data.videos = data.videos.map(v => {
      const detail = details.find(d => d.videoId === v.videoId);
      return detail ? { ...v, ...detail } : v;
    });
  }

  // 할당량 경고
  checkQuotaWarnings() {
    Object.entries(this.quotaUsed).forEach(([key, used], idx) => {
      const limit = this.quotaLimits[key];
      const percentage = (used / limit * 100).toFixed(1);
      
      if (used > limit * 0.9) {
        console.warn(`⚠️ API 키 ${idx + 1} 할당량 ${percentage}% 사용!`);
      } else if (used > limit * 0.7) {
        console.log(`📊 API 키 ${idx + 1} 할당량 ${percentage}% 사용`);
      }
    });
  }

  // 데이터 저장
  async saveData(data) {
    const date = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours().toString().padStart(2, '0');
    const filename = `${date}-${hour}h-${this.collectionType}.json`;
    const filepath = path.join(this.dataDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 데이터 저장: ${filename}`);
    
    // latest 파일 업데이트
    const latestPath = path.join(this.dataDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
    
    // 요약 생성
    this.generateSummary(data);
  }

  generateSummary(data) {
    const summary = {
      date: new Date().toISOString().split('T')[0],
      hour: new Date().getHours(),
      type: this.collectionType,
      stats: {
        channels: data.statistics.totalChannels,
        videos: data.statistics.totalVideos,
        apiUsage: data.statistics.quotaUsed,
        cacheHits: data.statistics.cacheHits
      },
      quotaStatus: Object.entries(this.quotaUsed).map(([key, used], idx) => ({
        key: `API_KEY${idx + 1}`,
        used: used,
        remaining: this.quotaLimits[key] - used,
        percentage: ((used / this.quotaLimits[key]) * 100).toFixed(1)
      }))
    };
    
    const summaryPath = path.join(this.dataDir, 'collection-summary.json');
    
    // 기존 요약에 추가
    let summaries = [];
    if (fs.existsSync(summaryPath)) {
      try {
        summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      } catch (e) {}
    }
    
    summaries.push(summary);
    
    // 최근 7일만 유지
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    summaries = summaries.filter(s => new Date(s.date) > sevenDaysAgo);
    
    fs.writeFileSync(summaryPath, JSON.stringify(summaries, null, 2));
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
  const collector = new OptimizedYouTubeCollector();
  collector.execute().catch(error => {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  });
}

module.exports = OptimizedYouTubeCollector;



