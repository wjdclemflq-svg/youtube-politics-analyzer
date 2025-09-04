const { getAPIManager, apiUtils } = require('./unified-api-manager');
const fs = require('fs').promises;
const path = require('path');

/**
 * 통합 데이터 수집기
 * - 86개 채널 정보 수집
 * - 각 채널의 최신 동영상/숏츠 수집
 * - 대시보드용 완벽한 데이터 구조 생성
 */
class IntegratedDataCollector {
  constructor() {
    this.apiManager = getAPIManager();
    this.results = {
      channels: [],
      videos: [],
      shorts: [],
      statistics: {}
    };
  }

  /**
   * 메인 실행 함수
   */
  async collect() {
    console.log('🚀 통합 데이터 수집 시작...');
    
    try {
      // 1. 채널 목록 로드
      await this.loadChannelList();
      
      // 2. 채널 정보 수집
      await this.collectChannelData();
      
      // 3. 동영상 데이터 수집
      await this.collectVideoData();
      
      // 4. 통계 계산
      this.calculateStatistics();
      
      // 5. 데이터 저장
      await this.saveResults();
      
      // 6. 최종 리포트
      this.printFinalReport();
      
    } catch (error) {
      console.error('❌ 데이터 수집 실패:', error);
      this.apiManager.printStatus();
      throw error;
    }
  }

  /**
   * 채널 목록 로드
   */
  async loadChannelList() {
    console.log('\n📋 채널 목록 로드 중...');
    
    // 하드코딩된 주요 채널들 + 기존 channels.json에서 로드
    const hardcodedChannels = [
      'UChlgI3UHCOnwUGzWzbJ3H5w', // YTN
      'UCWlV3Lz_55UaX4JsMj-z__Q', // TV조선
      'UCgeOlLcX6PReHdWImEnUVTg', // 스픽스
      'UCGbkN-3JpOct4KuEv59NF0Q', // 엠키타카
      'UCu0b6ODtYia0snp9JE4UUDw', // 세상만사
      'UC-YgJTCNVjXTNPKE6iITKdQ', // SBS
      'UCF4Wxdo3inmkOW3w7jHofcg', // KBS
      'UC5BMQOsAB5VPh7Q3dq8dGEQ'  // MBC
    ];
    
    this.channelIds = [...hardcodedChannels];
    
    // 기존 channels.json에서 추가 채널 로드
    try {
      const channelsPath = path.join(process.cwd(), 'data', 'channels.json');
      const existingData = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
      
      if (existingData.channels) {
        const existingIds = existingData.channels.map(ch => ch.id);
        const newIds = existingIds.filter(id => !this.channelIds.includes(id));
        this.channelIds.push(...newIds);
      }
    } catch (error) {
      console.log('⚠️ 기존 channels.json 로드 실패 (하드코딩 채널만 사용)');
    }
    
    console.log(`📊 수집 대상: ${this.channelIds.length}개 채널`);
  }

  /**
   * 채널 정보 수집
   */
  async collectChannelData() {
    console.log('\n🔍 채널 정보 수집 중...');
    
    const batchSize = 50; // YouTube API는 한 번에 최대 50개 채널 조회 가능
    
    for (let i = 0; i < this.channelIds.length; i += batchSize) {
      const batch = this.channelIds.slice(i, i + batchSize);
      
      try {
        console.log(`📦 배치 ${Math.floor(i/batchSize) + 1}/${Math.ceil(this.channelIds.length/batchSize)}: ${batch.length}개 채널`);
        
        const channels = await apiUtils.getChannels(batch);
        
        for (const channel of channels) {
          const processedChannel = {
            id: channel.id,
            title: channel.snippet.title,
            description: channel.snippet.description,
            customUrl: channel.snippet.customUrl,
            publishedAt: channel.snippet.publishedAt,
            subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
            videoCount: parseInt(channel.statistics.videoCount || 0),
            viewCount: parseInt(channel.statistics.viewCount || 0),
            thumbnails: channel.snippet.thumbnails,
            uploads: channel.contentDetails.relatedPlaylists.uploads,
            country: channel.snippet.country || 'KR'
          };
          
          this.results.channels.push(processedChannel);
          console.log(`  ✅ ${processedChannel.title}: ${processedChannel.subscriberCount.toLocaleString()}명`);
        }
        
        // API 부하 방지
        if (i + batchSize < this.channelIds.length) {
          console.log('  ⏳ 2초 대기...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ 배치 ${Math.floor(i/batchSize) + 1} 실패:`, error.message);
        continue;
      }
    }
    
    console.log(`✅ 채널 수집 완료: ${this.results.channels.length}개`);
  }

  /**
   * 동영상 데이터 수집
   */
  async collectVideoData() {
    console.log('\n🎥 동영상 데이터 수집 중...');
    
    const maxVideosPerChannel = 30; // 채널당 최대 30개 동영상
    let processedChannels = 0;
    
    for (const channel of this.results.channels) {
      try {
        console.log(`[${++processedChannels}/${this.results.channels.length}] ${channel.title}`);
        
        if (!channel.uploads) {
          console.log('  ⚠️ uploads 플레이리스트 없음');
          continue;
        }
        
        // 플레이리스트에서 최신 동영상 목록 가져오기
        const playlistItems = await apiUtils.getPlaylistItems(channel.uploads, maxVideosPerChannel);
        
        if (playlistItems.length === 0) {
          console.log('  📭 동영상 없음');
          continue;
        }
        
        // 비디오 ID 추출
        const videoIds = playlistItems.map(item => item.contentDetails.videoId);
        
        // 동영상 상세 정보 가져오기
        const videos = await apiUtils.getVideos(videoIds);
        
        let channelShorts = 0;
        let channelVideos = 0;
        
        for (const video of videos) {
          const videoData = {
            id: video.id,
            channelId: channel.id,
            channelTitle: channel.title,
            title: video.snippet.title,
            description: video.snippet.description?.substring(0, 200),
            publishedAt: video.snippet.publishedAt,
            duration: video.contentDetails.duration,
            durationSeconds: this.parseDuration(video.contentDetails.duration),
            viewCount: parseInt(video.statistics.viewCount || 0),
            likeCount: parseInt(video.statistics.likeCount || 0),
            commentCount: parseInt(video.statistics.commentCount || 0),
            thumbnails: video.snippet.thumbnails,
            tags: video.snippet.tags || [],
            isShorts: this.isShorts(video)
          };
          
          this.results.videos.push(videoData);
          
          if (videoData.isShorts) {
            this.results.shorts.push(videoData);
            channelShorts++;
          } else {
            channelVideos++;
          }
        }
        
        console.log(`  📊 숏츠: ${channelShorts}개, 일반: ${channelVideos}개`);
        
        // API 부하 방지
        if (processedChannels % 10 === 0) {
          console.log('  💤 3초 휴식...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        console.error(`  ❌ ${channel.title} 실패:`, error.message);
        continue;
      }
    }
    
    console.log(`✅ 동영상 수집 완료: ${this.results.videos.length}개 (숏츠: ${this.results.shorts.length}개)`);
  }

  /**
   * 통계 계산
   */
  calculateStatistics() {
    console.log('\n📊 통계 계산 중...');
    
    const totalChannels = this.results.channels.length;
    const totalVideos = this.results.videos.length;
    const totalShorts = this.results.shorts.length;
    const totalRegularVideos = totalVideos - totalShorts;
    
    const totalViewCount = this.results.videos.reduce((sum, v) => sum + v.viewCount, 0);
    const totalLikeCount = this.results.videos.reduce((sum, v) => sum + v.likeCount, 0);
    const averageViewsPerShort = totalShorts > 0 ? Math.round(this.results.shorts.reduce((sum, v) => sum + v.viewCount, 0) / totalShorts) : 0;
    
    // 채널별 숏츠 순위
    const channelShortsCount = {};
    this.results.shorts.forEach(short => {
      channelShortsCount[short.channelTitle] = (channelShortsCount[short.channelTitle] || 0) + 1;
    });
    
    const topChannelsByShorts = Object.entries(channelShortsCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([title, count]) => {
        const channel = this.results.channels.find(ch => ch.title === title);
        return {
          title,
          shortsCount: count,
          subscriberCount: channel?.subscriberCount || 0
        };
      });
    
    // 조회수 순 숏츠
    const topShortsByViews = [...this.results.shorts]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)
      .map(s => ({
        title: s.title,
        channelTitle: s.channelTitle,
        viewCount: s.viewCount,
        publishedAt: s.publishedAt
      }));
    
    this.results.statistics = {
      lastUpdated: new Date().toISOString(),
      totalChannelsAnalyzed: totalChannels,
      totalVideos,
      totalShorts,
      totalRegularVideos,
      totalViewCount,
      totalLikeCount,
      averageViewsPerShort,
      topChannelsByShorts,
      topShortsByViews
    };
    
    console.log(`✅ 통계 계산 완료`);
    console.log(`📈 채널: ${totalChannels}개, 동영상: ${totalVideos}개, 숏츠: ${totalShorts}개`);
    console.log(`👀 총 조회수: ${totalViewCount.toLocaleString()}`);
  }

  /**
   * 결과 저장
   */
  async saveResults() {
    console.log('\n💾 결과 저장 중...');
    
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    // 1. channels.json
    await fs.writeFile(
      path.join(dataDir, 'channels.json'),
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        totalChannels: this.results.channels.length,
        channels: this.results.channels
      }, null, 2)
    );
    
    // 2. videos.json
    await fs.writeFile(
      path.join(dataDir, 'videos.json'),
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        totalVideos: this.results.videos.length,
        videos: this.results.videos
      }, null, 2)
    );
    
    // 3. shorts.json
    await fs.writeFile(
      path.join(dataDir, 'shorts.json'),
      JSON.stringify({
        lastUpdated: new Date().toISOString(),
        totalShorts: this.results.shorts.length,
        shorts: this.results.shorts
      }, null, 2)
    );
    
    // 4. summary.json
    await fs.writeFile(
      path.join(dataDir, 'summary.json'),
      JSON.stringify(this.results.statistics, null, 2)
    );
    
    // 5. 대시보드용 통합 latest.json
    const dashboardData = {
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      channels: this.results.channels,
      videos: this.results.videos,
      shorts: this.results.shorts,
      statistics: this.results.statistics
    };
    
    await fs.writeFile(
      path.join(dataDir, 'latest.json'),
      JSON.stringify(dashboardData, null, 2)
    );
    
    console.log('✅ 모든 파일 저장 완료');
  }

  /**
   * 최종 리포트
   */
  printFinalReport() {
    console.log('\n🎉 수집 완료 리포트:');
    console.log(`📊 채널: ${this.results.statistics.totalChannelsAnalyzed}개`);
    console.log(`🎥 동영상: ${this.results.statistics.totalVideos}개`);
    console.log(`⚡ 숏츠: ${this.results.statistics.totalShorts}개`);
    console.log(`👀 총 조회수: ${this.results.statistics.totalViewCount.toLocaleString()}`);
    console.log(`📈 숏츠 평균 조회수: ${this.results.statistics.averageViewsPerShort.toLocaleString()}`);
    
    console.log('\n🏆 Top 5 숏츠 보유 채널:');
    this.results.statistics.topChannelsByShorts.slice(0, 5).forEach((ch, i) => {
      console.log(`${i+1}. ${ch.title}: ${ch.shortsCount}개`);
    });
    
    // API 사용량 리포트
    console.log('\n📊 API 사용량:');
    this.apiManager.printStatus();
  }

  /**
   * 동영상 길이를 초 단위로 변환
   */
  parseDuration(duration) {
    if (!duration) return 0;
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * 숏츠 판별
   */
  isShorts(video) {
    const duration = this.parseDuration(video.contentDetails?.duration);
    const title = (video.snippet?.title || '').toLowerCase();
    const description = (video.snippet?.description || '').toLowerCase();
    
    // 60초 이하는 무조건 숏츠
    if (duration > 0 && duration <= 60) {
      return true;
    }
    
    // 61-90초 사이인데 제목/설명에 shorts 키워드가 있는 경우
    if (duration > 60 && duration <= 90) {
      if (title.includes('shorts') || title.includes('#shorts') || 
          description.includes('#shorts') || title.includes('숏츠') ||
          title.includes('쇼츠')) {
        return true;
      }
    }
    
    return false;
  }
}

// 실행
async function main() {
  const collector = new IntegratedDataCollector();
  await collector.collect();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = IntegratedDataCollector;