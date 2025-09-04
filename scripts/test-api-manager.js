const { getAPIManager, apiUtils } = require('./unified-api-manager');

async function testAPIManager() {
  console.log('🧪 API 매니저 테스트 시작...');
  
  try {
    // API 매니저 인스턴스 생성
    const manager = getAPIManager();
    
    // 초기 상태 확인
    manager.printStatus();
    
    // 테스트 1: YTN 채널 정보 가져오기
    console.log('\n📺 테스트 1: YTN 채널 정보 가져오기...');
    const ytnChannelId = 'UChlgI3UHCOnwUGzWzbJ3H5w';
    
    const channels = await apiUtils.getChannels(ytnChannelId);
    
    if (channels && channels.length > 0) {
      const channel = channels[0];
      console.log('✅ 채널 정보 수집 성공:');
      console.log(`- 채널명: ${channel.snippet.title}`);
      console.log(`- 구독자: ${parseInt(channel.statistics.subscriberCount).toLocaleString()}명`);
      console.log(`- 총 조회수: ${parseInt(channel.statistics.viewCount).toLocaleString()}`);
      console.log(`- 동영상 수: ${parseInt(channel.statistics.videoCount).toLocaleString()}개`);
    }
    
    // 테스트 2: 간단한 검색
    console.log('\n🔍 테스트 2: 정치 관련 검색...');
    const searchResults = await apiUtils.search('정치 뉴스', {
      maxResults: 3,
      order: 'date'
    });
    
    console.log(`✅ 검색 결과: ${searchResults.length}개`);
    searchResults.forEach((video, index) => {
      console.log(`${index + 1}. ${video.snippet.title} (${video.snippet.channelTitle})`);
    });
    
    // 최종 상태 확인
    console.log('\n📊 테스트 완료 후 API 키 상태:');
    manager.printStatus();
    
    console.log('\n🎉 API 매니저 테스트 성공!');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    
    // 실패해도 상태 확인
    const manager = getAPIManager();
    manager.printStatus();
  }
}

// 실행
if (require.main === module) {
  testAPIManager().catch(console.error);
}

module.exports = testAPIManager;