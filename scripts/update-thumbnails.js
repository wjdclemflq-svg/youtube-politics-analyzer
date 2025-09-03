const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// API 키 로테이션 설정
const API_KEYS = [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3
];

let currentKeyIndex = 0;
let youtube;

// YouTube API 초기화 함수
function initializeYouTube(keyIndex) {
    youtube = google.youtube({
        version: 'v3',
        auth: API_KEYS[keyIndex]
    });
    console.log(`🔑 API Key ${keyIndex + 1} 사용 중`);
}

// API 키 로테이션 함수
async function executeWithRotation(apiCall) {
    try {
        return await apiCall();
    } catch (error) {
        if (error.code === 403 && error.errors?.[0]?.reason === 'quotaExceeded') {
            console.log(`⚠️ API Key ${currentKeyIndex + 1} 할당량 초과`);
            currentKeyIndex++;
            
            if (currentKeyIndex < API_KEYS.length) {
                console.log(`🔄 API Key ${currentKeyIndex + 1}로 전환`);
                initializeYouTube(currentKeyIndex);
                return await apiCall();
            } else {
                throw new Error('모든 API 키 할당량 소진');
            }
        }
        throw error;
    }
}

async function updateThumbnails() {
    console.log('🚀 썸네일 업데이트 시작...\n');
    
    // channels.json 파일 경로
    const channelsPath = path.join(__dirname, '..', 'data', 'channels.json');
    
    // 파일 존재 확인
    if (!fs.existsSync(channelsPath)) {
        console.error('❌ channels.json 파일을 찾을 수 없습니다.');
        console.log('📁 파일 경로:', channelsPath);
        return;
    }
    
    // 기존 채널 데이터 읽기
    const channels = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
    console.log(`📊 총 ${channels.length}개 채널 발견\n`);
    
    // 백업 생성
    const backupPath = path.join(__dirname, '..', 'data', `channels_backup_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(channels, null, 2));
    console.log(`💾 백업 파일 생성: ${backupPath}\n`);
    
    // YouTube API 초기화
    initializeYouTube(currentKeyIndex);
    
    let updateCount = 0;
    let errorCount = 0;
    
    // 각 채널 처리
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        
        try {
            const response = await executeWithRotation(async () => {
                return await youtube.channels.list({
                    part: 'snippet,statistics',
                    id: channel.id || channel.channelId
                });
            });
            
            if (response.data.items && response.data.items.length > 0) {
                const item = response.data.items[0];
                
                // 썸네일 URL 업데이트
                const thumbnails = item.snippet.thumbnails;
                channel.thumbnail = thumbnails.high?.url || 
                                  thumbnails.medium?.url || 
                                  thumbnails.default?.url;
                
                // 추가 정보도 업데이트
                channel.title = item.snippet.title;
                channel.description = item.snippet.description;
                channel.customUrl = item.snippet.customUrl;
                channel.publishedAt = item.snippet.publishedAt;
                
                // 최신 통계 업데이트
                if (item.statistics) {
                    channel.subscriberCount = parseInt(item.statistics.subscriberCount) || 0;
                    channel.viewCount = parseInt(item.statistics.viewCount) || 0;
                    channel.videoCount = parseInt(item.statistics.videoCount) || 0;
                }
                
                updateCount++;
                console.log(`✅ [${i + 1}/${channels.length}] ${channel.title}`);
                console.log(`   📸 썸네일: ${channel.thumbnail?.substring(0, 50)}...`);
                console.log(`   👥 구독자: ${channel.subscriberCount?.toLocaleString()}`);
                console.log(`   👁️ 총 조회수: ${channel.viewCount?.toLocaleString()}\n`);
            } else {
                console.log(`⚠️ [${i + 1}/${channels.length}] ${channel.title || channel.id} - 데이터 없음\n`);
            }
            
            // API 호출 제한 방지 (1초 대기)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            errorCount++;
            console.error(`❌ [${i + 1}/${channels.length}] ${channel.title || channel.id}`);
            console.error(`   오류: ${error.message}\n`);
        }
    }
    
    // 업데이트된 데이터 저장
    fs.writeFileSync(channelsPath, JSON.stringify(channels, null, 2));
    
    // 요약 통계 생성
    const summary = {
        lastUpdated: new Date().toISOString(),
        totalChannels: channels.length,
        updatedChannels: updateCount,
        failedChannels: errorCount,
        totalSubscribers: channels.reduce((sum, ch) => sum + (ch.subscriberCount || 0), 0),
        totalViews: channels.reduce((sum, ch) => sum + (ch.viewCount || 0), 0)
    };
    
    const summaryPath = path.join(__dirname, '..', 'data', 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    // 완료 메시지
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 업데이트 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 성공: ${updateCount}개 채널`);
    console.log(`❌ 실패: ${errorCount}개 채널`);
    console.log(`👥 총 구독자: ${summary.totalSubscribers.toLocaleString()}`);
    console.log(`👁️ 총 조회수: ${summary.totalViews.toLocaleString()}`);
    console.log(`💾 저장 위치: ${channelsPath}`);
    console.log(`📈 요약 파일: ${summaryPath}`);
}

// 환경 변수 확인
if (!API_KEYS[0]) {
    console.error('❌ 환경 변수 YOUTUBE_API_KEY_1이 설정되지 않았습니다.');
    console.log('\n💡 해결 방법:');
    console.log('1. .env 파일 생성 또는');
    console.log('2. export YOUTUBE_API_KEY_1="your-api-key" 실행');
    process.exit(1);
}

// 실행
updateThumbnails().catch(error => {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
});
