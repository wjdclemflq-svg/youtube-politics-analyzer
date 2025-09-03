const { google } = require('googleapis');

// API 키 로테이션 시스템
class YouTubeAPIRotation {
  constructor() {
    // 3개의 API 키 설정
    this.apiKeys = [
      process.env.YOUTUBE_API_KEY_1,
      process.env.YOUTUBE_API_KEY_2,
      process.env.YOUTUBE_API_KEY_3
    ].filter(key => key); // undefined 제거
    
    this.currentKeyIndex = 0;
    this.keyUsageCount = [0, 0, 0]; // 각 키별 사용 횟수
    this.keyQuotaExceeded = [false, false, false]; // 각 키별 할당량 초과 상태
    
    // 현재 YouTube 인스턴스
    this.youtube = null;
    this.initializeYouTube();
  }
  
  initializeYouTube() {
    if (this.apiKeys.length === 0) {
      throw new Error('No API keys available!');
    }
    
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.apiKeys[this.currentKeyIndex]
    });
    
    console.log(`🔑 Using API Key #${this.currentKeyIndex + 1} of ${this.apiKeys.length}`);
  }
  
  // 다음 사용 가능한 키로 전환
  switchToNextKey() {
    const originalIndex = this.currentKeyIndex;
    
    // 다음 키 찾기
    do {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      
      // 모든 키가 초과된 경우
      if (this.currentKeyIndex === originalIndex) {
        if (this.keyQuotaExceeded.every(exceeded => exceeded)) {
          throw new Error('All API keys have exceeded quota!');
        }
        break;
      }
    } while (this.keyQuotaExceeded[this.currentKeyIndex]);
    
    this.initializeYouTube();
    console.log(`🔄 Switched to API Key #${this.currentKeyIndex + 1}`);
  }
  
  // API 호출 래퍼 (자동 키 전환 포함)
  async executeWithRotation(apiCall) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;
    
    while (attempts < maxAttempts) {
      try {
        // API 호출 실행
        const result = await apiCall(this.youtube);
        
        // 성공시 사용 횟수 증가
        this.keyUsageCount[this.currentKeyIndex]++;
        
        // 100번 호출마다 키 전환 (부하 분산)
        if (this.keyUsageCount[this.currentKeyIndex] % 100 === 0) {
          console.log(`📊 Key #${this.currentKeyIndex + 1} used ${this.keyUsageCount[this.currentKeyIndex]} times`);
          this.switchToNextKey();
        }
        
        return result;
        
      } catch (error) {
        // 할당량 초과 에러 처리
        if (error.message && error.message.includes('quota')) {
          console.log(`❌ Key #${this.currentKeyIndex + 1} quota exceeded`);
          this.keyQuotaExceeded[this.currentKeyIndex] = true;
          
          // 다른 키가 있으면 전환
          if (!this.keyQuotaExceeded.every(exceeded => exceeded)) {
            this.switchToNextKey();
            attempts++;
            continue;
          } else {
            throw new Error('All API keys have exceeded quota');
          }
        }
        
        // 다른 에러는 그대로 throw
        throw error;
      }
    }
  }
  
  // 상태 리포트
  getStatus() {
    return {
      totalKeys: this.apiKeys.length,
      currentKey: this.currentKeyIndex + 1,
      usage: this.keyUsageCount,
      quotaExceeded: this.keyQuotaExceeded,
      availableKeys: this.keyQuotaExceeded.filter(exceeded => !exceeded).length
    };
  }
}

// 채널 정보 가져오기 (키 로테이션 적용)
async function getChannelWithRotation(apiRotation, channelHandle) {
  return await apiRotation.executeWithRotation(async (youtube) => {
    // 채널 검색
    const searchResponse = await youtube.search.list({
      q: channelHandle,
      type: 'channel',
      maxResults: 1,
      part: 'snippet'
    });
    
    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      const channelId = searchResponse.data.items[0].snippet.channelId;
      
      // 채널 상세 정보
      const channelResponse = await youtube.channels.list({
        id: channelId,
        part: 'snippet,statistics,contentDetails'
      });
      
      return channelResponse.data.items[0];
    }
    
    return null;
  });
}

// 비디오 정보 가져오기 (키 로테이션 적용)
async function getVideosWithRotation(apiRotation, playlistId, maxResults = 50) {
  return await apiRotation.executeWithRotation(async (youtube) => {
    const response = await youtube.playlistItems.list({
      playlistId: playlistId,
      part: 'snippet,contentDetails',
      maxResults: maxResults
    });
    
    return response.data.items;
  });
}

// 내보내기
module.exports = {
  YouTubeAPIRotation,
  getChannelWithRotation,
  getVideosWithRotation
};
