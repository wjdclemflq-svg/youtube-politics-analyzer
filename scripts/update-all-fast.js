const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API_KEYS = [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3
    process.env.YOUTUBE_API_KEY_4
    process.env.YOUTUBE_API_KEY_5
].filter(key => key);

console.log(`🔑 ${API_KEYS.length}개의 API 키 발견\n`);
let currentKeyIndex = 0;

function getYouTube(keyIndex) {
    return google.youtube({
        version: 'v3',
        auth: API_KEYS[keyIndex]
    });
}

async function updateAllChannels() {
    const channelsPath = path.join(__dirname, '..', 'data', 'channels.json');
    const data = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
    const channels = data.channels || data;
    
    console.log(`📊 ${channels.length}개 채널 처리 시작...\n`);
    
    let youtube = getYouTube(currentKeyIndex);
    let updated = [];
    
    // 50개씩 배치 처리 (API 효율적 사용)
    for (let i = 0; i < channels.length; i += 50) {
        const batch = channels.slice(i, Math.min(i + 50, channels.length));
        const ids = batch.map(ch => ch.id).join(',');
        
        let success = false;
        let attempts = 0;
        
        while (!success && attempts < API_KEYS.length) {
            try {
                console.log(`🔑 API Key ${currentKeyIndex + 1} 사용 - 배치 ${Math.floor(i/50) + 1}/${Math.ceil(channels.length/50)}`);
                
                const response = await youtube.channels.list({
                    part: 'snippet,statistics',
                    id: ids,
                    maxResults: 50
                });
                
                // 응답 데이터로 채널 정보 업데이트
                response.data.items.forEach(item => {
                    const channel = batch.find(ch => ch.id === item.id);
                    if (channel) {
                        channel.title = item.snippet.title;
                        channel.thumbnail = item.snippet.thumbnails.high?.url || 
                                          item.snippet.thumbnails.default?.url;
                        channel.subscriberCount = parseInt(item.statistics.subscriberCount) || 0;
                        channel.viewCount = parseInt(item.statistics.viewCount) || 0;
                        updated.push(channel);
                    }
                });
                
                console.log(`✅ ${updated.length}/${channels.length} 완료\n`);
                success = true;
                
            } catch (error) {
                if (error.code === 403 && attempts < API_KEYS.length - 1) {
                    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                    youtube = getYouTube(currentKeyIndex);
                    console.log(`🔄 API Key ${currentKeyIndex + 1}로 전환\n`);
                    attempts++;
                } else {
                    console.error(`❌ 에러:`, error.message);
                    break;
                }
            }
        }
    }
    
    // 저장
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(channelsPath, JSON.stringify(data, null, 2));
    
    console.log(`💾 ${updated.length}개 채널 정보 업데이트 완료!`);
}

updateAllChannels().catch(console.error);