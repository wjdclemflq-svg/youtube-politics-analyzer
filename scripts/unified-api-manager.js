const { google } = require('googleapis');

/**
 * 통합 YouTube API 키 로테이션 시스템
 * 모든 스크립트에서 공통으로 사용 가능
 */
class UnifiedAPIManager {
  constructor() {
    this.apiKeys = [
      process.env.YOUTUBE_API_KEY_1,
      process.env.YOUTUBE_API_KEY_2,
      process.env.YOUTUBE_API_KEY_3,
      process.env.YOUTUBE_API_KEY_4,
      process.env.YOUTUBE_API_KEY_5
    ].filter(key => key && key.trim()); // 빈 키 제거
    
    this.currentKeyIndex = 0;
    this.keyUsageCount = {};
    this.keyErrors = {};
    this.dailyQuotaLimit = 10000; // 키당 일일 할당량
    this.maxRetries = 3;
    
    // 키별 사용량 초기화
    this.apiKeys.forEach((key, index) => {
      this.keyUsageCount[index] = 0;
      this.keyErrors[index] = 0;
    });
    
    console.log(`🔑 API 키 매니저 초기화: ${this.apiKeys.length}개 키 로드됨`);
  }
  
  /**
   * 현재 사용 가능한 API 키 반환
   */
  getCurrentKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('사용 가능한 API 키가 없습니다.');
    }
    
    // 현재 키가 할당량을 초과했거나 오류가 많으면 다음 키로 회전
    if (this.shouldRotateKey()) {
      this.rotateToNextKey();
    }
    
    const currentKey = this.apiKeys[this.currentKeyIndex];
    console.log(`🔑 API 키 #${this.currentKeyIndex + 1} 사용 중 (사용량: ${this.keyUsageCount[this.currentKeyIndex]}/${this.dailyQuotaLimit})`);
    
    return currentKey;
  }
  
  /**
   * YouTube API 클라이언트 생성
   */
  createYouTubeClient() {
    const apiKey = this.getCurrentKey();
    return google.youtube({
      version: 'v3',
      auth: apiKey
    });
  }
  
  /**
   * API 호출 래퍼 (자동 로테이션 포함)
   */
  async makeAPICall(apiCallFunction, retries = 0) {
    try {
      const youtube = this.createYouTubeClient();
      this.incrementUsage();
      
      const result = await apiCallFunction(youtube);
      
      // 성공 시 오류 카운트 리셋
      this.keyErrors[this.currentKeyIndex] = 0;
      
      return result;
      
    } catch (error) {
      console.error(`❌ API 호출 오류 (키 #${this.currentKeyIndex + 1}):`, error.message);
      
      this.keyErrors[this.currentKeyIndex]++;
      
      // 할당량 초과 또는 키 오류 시 다음 키로 회전
      if (this.isQuotaError(error) || this.isKeyError(error)) {
        console.log(`🔄 키 #${this.currentKeyIndex + 1} 사용 불가, 다음 키로 회전...`);
        this.rotateToNextKey();
        
        // 재시도
        if (retries < this.maxRetries && this.hasAvailableKeys()) {
          console.log(`🔁 재시도 ${retries + 1}/${this.maxRetries}`);
          return await this.makeAPICall(apiCallFunction, retries + 1);
        }
      }
      
      throw error;
    }
  }
  
  /**
   * 키 회전이 필요한지 확인
   */
  shouldRotateKey() {
    const currentUsage = this.keyUsageCount[this.currentKeyIndex];
    const currentErrors = this.keyErrors[this.currentKeyIndex];
    
    // 할당량의 90% 사용했거나 오류가 5번 이상 발생하면 회전
    return (currentUsage >= this.dailyQuotaLimit * 0.9) || (currentErrors >= 5);
  }
  
  /**
   * 다음 키로 회전
   */
  rotateToNextKey() {
    const initialIndex = this.currentKeyIndex;
    
    do {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    } while (
      this.currentKeyIndex !== initialIndex &&
      this.shouldSkipKey(this.currentKeyIndex)
    );
    
    if (this.currentKeyIndex === initialIndex && this.shouldSkipKey(this.currentKeyIndex)) {
      console.error('⚠️ 모든 API 키가 사용 불가 상태입니다.');
    } else {
      console.log(`🔄 API 키 #${this.currentKeyIndex + 1}으로 회전`);
    }
  }
  
  /**
   * 특정 키를 건너뛸지 확인
   */
  shouldSkipKey(keyIndex) {
    const usage = this.keyUsageCount[keyIndex];
    const errors = this.keyErrors[keyIndex];
    
    return (usage >= this.dailyQuotaLimit) || (errors >= 10);
  }
  
  /**
   * 사용 가능한 키가 있는지 확인
   */
  hasAvailableKeys() {
    return this.apiKeys.some((_, index) => !this.shouldSkipKey(index));
  }
  
  /**
   * 사용량 증가
   */
  incrementUsage() {
    this.keyUsageCount[this.currentKeyIndex]++;
  }
  
  /**
   * 할당량 초과 오류인지 확인
   */
  isQuotaError(error) {
    const message = error.message?.toLowerCase() || '';
    return message.includes('quota') || 
           message.includes('exceeded') ||
           message.includes('limit') ||
           error.code === 403;
  }
  
  /**
   * 키 관련 오류인지 확인
   */
  isKeyError(error) {
    const message = error.message?.toLowerCase() || '';
    return message.includes('api key not valid') ||
           message.includes('invalid api key') ||
           error.code === 400;
  }
  
  /**
   * 현재 상태 리포트
   */
  getStatusReport() {
    const report = {
      totalKeys: this.apiKeys.length,
      currentKey: this.currentKeyIndex + 1,
      keyUsage: {},
      availableKeys: 0,
      totalUsage: 0
    };
    
    this.apiKeys.forEach((_, index) => {
      const usage = this.keyUsageCount[index];
      const errors = this.keyErrors[index];
      const available = !this.shouldSkipKey(index);
      
      report.keyUsage[`key_${index + 1}`] = {
        usage: usage,
        errors: errors,
        available: available,
        percentage: Math.round((usage / this.dailyQuotaLimit) * 100)
      };
      
      if (available) report.availableKeys++;
      report.totalUsage += usage;
    });
    
    return report;
  }
  
  /**
   * 상태 출력
   */
  printStatus() {
    const report = this.getStatusReport();
    
    console.log('\n📊 API 키 사용 현황:');
    console.log(`전체 키: ${report.totalKeys}개, 사용 가능: ${report.availableKeys}개`);
    console.log(`현재 키: #${report.currentKey}`);
    console.log(`총 사용량: ${report.totalUsage}`);
    
    Object.entries(report.keyUsage).forEach(([key, data]) => {
      const status = data.available ? '🟢' : '🔴';
      console.log(`${status} ${key.replace('_', ' ')}: ${data.usage}회 (${data.percentage}%, 오류: ${data.errors}회)`);
    });
  }
}

// 전역 인스턴스 생성 (싱글톤 패턴)
let apiManager = null;

/**
 * API 매니저 인스턴스 가져오기
 */
function getAPIManager() {
  if (!apiManager) {
    require('dotenv').config();
    apiManager = new UnifiedAPIManager();
  }
  return apiManager;
}

/**
 * 편의 함수들
 */
const apiUtils = {
  
  /**
   * 채널 정보 가져오기
   */
  async getChannels(channelIds) {
    const manager = getAPIManager();
    
    return await manager.makeAPICall(async (youtube) => {
      const response = await youtube.channels.list({
        id: Array.isArray(channelIds) ? channelIds.join(',') : channelIds,
        part: 'snippet,statistics,contentDetails'
      });
      return response.data.items || [];
    });
  },
  
  /**
   * 동영상 정보 가져오기
   */
  async getVideos(videoIds) {
    const manager = getAPIManager();
    
    return await manager.makeAPICall(async (youtube) => {
      const response = await youtube.videos.list({
        id: Array.isArray(videoIds) ? videoIds.join(',') : videoIds,
        part: 'snippet,statistics,contentDetails'
      });
      return response.data.items || [];
    });
  },
  
  /**
   * 플레이리스트 아이템 가져오기
   */
  async getPlaylistItems(playlistId, maxResults = 50) {
    const manager = getAPIManager();
    
    return await manager.makeAPICall(async (youtube) => {
      const response = await youtube.playlistItems.list({
        playlistId: playlistId,
        part: 'snippet,contentDetails',
        maxResults: maxResults
      });
      return response.data.items || [];
    });
  },
  
  /**
   * 검색 수행
   */
  async search(query, options = {}) {
    const manager = getAPIManager();
    
    return await manager.makeAPICall(async (youtube) => {
      const response = await youtube.search.list({
        q: query,
        type: 'video',
        part: 'id,snippet',
        maxResults: options.maxResults || 50,
        order: options.order || 'relevance',
        publishedAfter: options.publishedAfter,
        videoDuration: options.videoDuration,
        regionCode: 'KR',
        relevanceLanguage: 'ko',
        ...options
      });
      return response.data.items || [];
    });
  }
};

module.exports = {
  UnifiedAPIManager,
  getAPIManager,
  apiUtils
};